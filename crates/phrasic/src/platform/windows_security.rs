//! The sole Windows FFI boundary for the named-pipe DACL.
//!
//! Invariants: the descriptor grants the current interactive token user only
//! read/write pipe access; the descriptor and token handle stay valid for the
//! `CreateNamedPipe` call and are released exactly once afterwards.
#![allow(unsafe_code)]

use std::ffi::c_void;
use std::io;
use std::mem::size_of;
use std::ptr::null_mut;

use tokio::net::windows::named_pipe::{NamedPipeServer, ServerOptions};
use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, HANDLE, LocalFree};
use windows_sys::Win32::Security::Authorization::{
    ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
};
use windows_sys::Win32::Security::{
    GetTokenInformation, PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES, TOKEN_QUERY, TOKEN_USER,
    TokenUser,
};
use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

const PIPE_CLIENT_ACCESS_MASK: u32 = 0x0012_019f;

/// Creates one named-pipe instance with a DACL limited to the current token user.
///
/// The only unsafe call to Tokio's raw security-attributes API is here. The
/// `SecurityDescriptor` owns the allocation until `CreateNamedPipe` returns,
/// after which Windows has consumed the attributes.
pub(crate) fn create_pipe_with_current_user_dacl(
    options: &ServerOptions,
    endpoint: &str,
) -> io::Result<NamedPipeServer> {
    let descriptor = SecurityDescriptor::for_current_user()?;
    let mut attributes = SECURITY_ATTRIBUTES {
        nLength: u32::try_from(size_of::<SECURITY_ATTRIBUTES>())
            .map_err(|_| io::Error::other("security attributes length"))?,
        lpSecurityDescriptor: descriptor.raw.cast(),
        bInheritHandle: 0,
    };
    unsafe {
        options.create_with_security_attributes_raw(
            endpoint,
            (&mut attributes as *mut SECURITY_ATTRIBUTES).cast::<c_void>(),
        )
    }
}

struct SecurityDescriptor {
    raw: PSECURITY_DESCRIPTOR,
}

impl SecurityDescriptor {
    fn for_current_user() -> io::Result<Self> {
        let sid = current_user_sid()?;
        let sddl = format!("D:P(A;;0x{PIPE_CLIENT_ACCESS_MASK:08x};;;{sid})");
        let mut wide = sddl.encode_utf16().collect::<Vec<_>>();
        wide.push(0);
        let mut raw = null_mut();
        let created = unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                wide.as_ptr(),
                SDDL_REVISION_1,
                &mut raw,
                null_mut(),
            )
        };
        if created == 0 {
            return Err(last_error());
        }
        Ok(Self { raw })
    }
}

impl Drop for SecurityDescriptor {
    fn drop(&mut self) {
        if !self.raw.is_null() {
            unsafe {
                LocalFree(self.raw.cast());
            }
        }
    }
}

fn current_user_sid() -> io::Result<String> {
    let token = TokenHandle::open_current()?;
    let mut length = 0_u32;
    let first = unsafe { GetTokenInformation(token.raw, TokenUser, null_mut(), 0, &mut length) };
    if first != 0 || length == 0 {
        return Err(last_error());
    }
    let capacity = usize::try_from(length).map_err(|_| io::Error::other("token length"))?;
    let mut buffer = vec![0_u8; capacity];
    let populated = unsafe {
        GetTokenInformation(
            token.raw,
            TokenUser,
            buffer.as_mut_ptr().cast(),
            length,
            &mut length,
        )
    };
    if populated == 0 {
        return Err(last_error());
    }
    let user = unsafe { &*buffer.as_ptr().cast::<TOKEN_USER>() };
    sid_to_string(user.User.Sid)
}

fn sid_to_string(sid: *mut c_void) -> io::Result<String> {
    let mut raw = null_mut();
    let converted = unsafe { ConvertSidToStringSidW(sid, &mut raw) };
    if converted == 0 {
        return Err(last_error());
    }
    let result = unsafe {
        let mut length = 0_usize;
        while *raw.add(length) != 0 {
            length += 1;
        }
        String::from_utf16(std::slice::from_raw_parts(raw, length))
            .map_err(|_| io::Error::other("token SID"))
    };
    unsafe {
        LocalFree(raw.cast());
    }
    result
}

struct TokenHandle {
    raw: HANDLE,
}

impl TokenHandle {
    fn open_current() -> io::Result<Self> {
        let mut raw = null_mut();
        let opened = unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut raw) };
        if opened == 0 {
            return Err(last_error());
        }
        Ok(Self { raw })
    }
}

impl Drop for TokenHandle {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.raw);
        }
    }
}

fn last_error() -> io::Error {
    let code = unsafe { GetLastError() };
    let converted = match i32::try_from(code) {
        Ok(value) => value,
        Err(_) => i32::MAX,
    };
    io::Error::from_raw_os_error(converted)
}
