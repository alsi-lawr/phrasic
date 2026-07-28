//! Bounded loading of selected MPRIS artwork without exposing its source URI.

use std::fs::File;
use std::io::Read;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::path::PathBuf;
use std::time::Duration;

use phrasic_rpc::MAXIMUM_ARTWORK_BYTES;
use phrasic_rpc::local::{Artwork, ArtworkFormat};
use reqwest::redirect::Policy;
use tokio::net::lookup_host;
use tokio::task::spawn_blocking;
use tokio::time::timeout;
use url::Url;

const ARTWORK_LOAD_DEADLINE: Duration = Duration::from_secs(1);

#[derive(Clone, Debug, Eq, PartialEq)]
struct CachedArtwork {
    source: String,
    value: Artwork,
}

#[derive(Debug, Default)]
pub(super) struct ArtworkLoader {
    cached: Option<CachedArtwork>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ArtworkLoadError {
    InvalidSource,
    Io,
    Network,
    TooLarge,
    UnsupportedFormat,
}

enum ArtworkSource {
    File(PathBuf),
    Https(Url),
}

impl ArtworkLoader {
    pub(super) async fn load(&mut self, source: &str) -> Option<Artwork> {
        if let Some(cached) = self.cached.as_ref()
            && cached.source == source
        {
            return Some(cached.value.clone());
        }

        let result = timeout(ARTWORK_LOAD_DEADLINE, load_uncached(source)).await;
        let artwork = match result {
            Ok(Ok(artwork)) => artwork,
            Ok(Err(_)) | Err(_) => return None,
        };
        self.cached = Some(CachedArtwork {
            source: source.to_owned(),
            value: artwork.clone(),
        });
        Some(artwork)
    }
}

async fn load_uncached(source: &str) -> Result<Artwork, ArtworkLoadError> {
    let source = parse_source(source)?;
    let data = match source {
        ArtworkSource::File(path) => read_file(path).await?,
        ArtworkSource::Https(url) => read_https(url).await?,
    };
    artwork_from_bytes(data)
}

fn parse_source(source: &str) -> Result<ArtworkSource, ArtworkLoadError> {
    let url = Url::parse(source).map_err(|_| ArtworkLoadError::InvalidSource)?;
    if url.fragment().is_some() || !url.username().is_empty() || url.password().is_some() {
        return Err(ArtworkLoadError::InvalidSource);
    }

    match url.scheme() {
        "file" if url.query().is_none() => url
            .to_file_path()
            .map(ArtworkSource::File)
            .map_err(|()| ArtworkLoadError::InvalidSource),
        "https" if url.host().is_some() => Ok(ArtworkSource::Https(url)),
        _ => Err(ArtworkLoadError::InvalidSource),
    }
}

async fn read_file(path: PathBuf) -> Result<Vec<u8>, ArtworkLoadError> {
    spawn_blocking(move || read_bounded(File::open(path).map_err(|_| ArtworkLoadError::Io)?))
        .await
        .map_err(|_| ArtworkLoadError::Io)?
}

fn read_bounded(file: File) -> Result<Vec<u8>, ArtworkLoadError> {
    let maximum_read = u64::try_from(MAXIMUM_ARTWORK_BYTES)
        .map_err(|_| ArtworkLoadError::TooLarge)?
        .saturating_add(1);
    let mut data = Vec::new();
    file.take(maximum_read)
        .read_to_end(&mut data)
        .map_err(|_| ArtworkLoadError::Io)?;
    enforce_size(&data)?;
    Ok(data)
}

async fn read_https(url: Url) -> Result<Vec<u8>, ArtworkLoadError> {
    let host = url.host_str().ok_or(ArtworkLoadError::InvalidSource)?;
    let port = url
        .port_or_known_default()
        .ok_or(ArtworkLoadError::InvalidSource)?;
    let addresses = public_addresses(host, port).await?;
    let client = reqwest::Client::builder()
        .https_only(true)
        .no_proxy()
        .redirect(Policy::none())
        .connect_timeout(ARTWORK_LOAD_DEADLINE)
        .timeout(ARTWORK_LOAD_DEADLINE)
        .resolve_to_addrs(host, &addresses)
        .build()
        .map_err(|_| ArtworkLoadError::Network)?;
    let mut response = client
        .get(url)
        .header("accept", "image/png, image/jpeg, image/webp")
        .send()
        .await
        .map_err(|_| ArtworkLoadError::Network)?;
    if !response.status().is_success()
        || response
            .content_length()
            .is_some_and(|length| length > MAXIMUM_ARTWORK_BYTES as u64)
    {
        return Err(ArtworkLoadError::Network);
    }

    let mut data = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| ArtworkLoadError::Network)?
    {
        if data.len().saturating_add(chunk.len()) > MAXIMUM_ARTWORK_BYTES {
            return Err(ArtworkLoadError::TooLarge);
        }
        data.extend_from_slice(&chunk);
    }
    Ok(data)
}

async fn public_addresses(host: &str, port: u16) -> Result<Vec<SocketAddr>, ArtworkLoadError> {
    let addresses = lookup_host((host, port))
        .await
        .map_err(|_| ArtworkLoadError::Network)?
        .collect::<Vec<_>>();
    if addresses.is_empty() || addresses.iter().any(|address| !is_public(address.ip())) {
        return Err(ArtworkLoadError::InvalidSource);
    }
    Ok(addresses)
}

fn is_public(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => is_public_ipv4(address),
        IpAddr::V6(address) => is_public_ipv6(address),
    }
}

fn is_public_ipv4(address: Ipv4Addr) -> bool {
    let [first, second, third, fourth] = address.octets();
    !matches!(
        (first, second, third, fourth),
        (0 | 10 | 127, _, _, _)
            | (100, 64..=127, _, _)
            | (169, 254, _, _)
            | (172, 16..=31, _, _)
            | (192, 0, 0 | 2, _)
            | (192, 88, 99, _)
            | (192, 168, _, _)
            | (198, 18 | 19, _, _)
            | (198, 51, 100, _)
            | (203, 0, 113, _)
            | (224..=255, _, _, _)
    )
}

fn is_public_ipv6(address: Ipv6Addr) -> bool {
    if let Some(mapped) = address.to_ipv4_mapped() {
        return is_public_ipv4(mapped);
    }
    let [first, second, ..] = address.segments();
    address != Ipv6Addr::UNSPECIFIED
        && address != Ipv6Addr::LOCALHOST
        && first & 0xfe00 != 0xfc00
        && first & 0xffc0 != 0xfe80
        && first & 0xff00 != 0xff00
        && !(first == 0x2001 && second == 0x0db8)
}

fn enforce_size(data: &[u8]) -> Result<(), ArtworkLoadError> {
    if data.is_empty() {
        return Err(ArtworkLoadError::UnsupportedFormat);
    }
    if data.len() > MAXIMUM_ARTWORK_BYTES {
        return Err(ArtworkLoadError::TooLarge);
    }
    Ok(())
}

fn artwork_from_bytes(data: Vec<u8>) -> Result<Artwork, ArtworkLoadError> {
    enforce_size(&data)?;
    let format = detect_format(&data).ok_or(ArtworkLoadError::UnsupportedFormat)?;
    Ok(Artwork {
        format: format.into(),
        data,
    })
}

fn detect_format(data: &[u8]) -> Option<ArtworkFormat> {
    if data.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some(ArtworkFormat::Png);
    }
    if data.starts_with(b"\xff\xd8\xff") && data.ends_with(b"\xff\xd9") {
        return Some(ArtworkFormat::Jpeg);
    }
    if data.len() >= 12 && data.starts_with(b"RIFF") && &data[8..12] == b"WEBP" {
        return Some(ArtworkFormat::Webp);
    }
    None
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::*;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\nvalid-for-format-detection";
    const JPEG: &[u8] = b"\xff\xd8\xffvalid-for-format-detection\xff\xd9";
    const WEBP: &[u8] = b"RIFF\x04\x00\x00\x00WEBP";

    #[test]
    fn supported_artwork_formats_are_detected_from_bytes() {
        assert_eq!(detect_format(PNG), Some(ArtworkFormat::Png));
        assert_eq!(detect_format(JPEG), Some(ArtworkFormat::Jpeg));
        assert_eq!(detect_format(WEBP), Some(ArtworkFormat::Webp));
        assert_eq!(detect_format(b"<svg></svg>"), None);
        assert_eq!(detect_format(b"GIF89a"), None);
    }

    #[test]
    fn source_policy_accepts_file_and_https_only() {
        assert!(matches!(
            parse_source("file:///home/example/cover.png"),
            Ok(ArtworkSource::File(_))
        ));
        assert!(matches!(
            parse_source("https://media.example/cover.png"),
            Ok(ArtworkSource::Https(_))
        ));
        for rejected in [
            "http://media.example/cover.png",
            "ftp://media.example/cover.png",
            "https://user:password@media.example/cover.png",
            "https://media.example/cover.png#fragment",
            "file:///home/example/cover.png?query",
            "not a URL",
        ] {
            assert!(matches!(
                parse_source(rejected),
                Err(ArtworkLoadError::InvalidSource)
            ));
        }
    }

    #[test]
    fn private_and_reserved_network_destinations_are_rejected() {
        for address in [
            IpAddr::V4(Ipv4Addr::LOCALHOST),
            IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1)),
            IpAddr::V4(Ipv4Addr::new(169, 254, 1, 1)),
            IpAddr::V6(Ipv6Addr::LOCALHOST),
            IpAddr::V6(Ipv6Addr::new(0xfc00, 0, 0, 0, 0, 0, 0, 1)),
        ] {
            assert!(!is_public(address));
        }
        assert!(is_public(IpAddr::V4(Ipv4Addr::new(1, 1, 1, 1))));
        assert!(is_public(IpAddr::V6(Ipv6Addr::new(
            0x2606, 0x4700, 0x4700, 0, 0, 0, 0, 0x1111,
        ))));
    }

    #[tokio::test]
    async fn local_artwork_is_bounded_and_invalid_input_retries_as_fallback()
    -> Result<(), Box<dyn std::error::Error>> {
        let directory = tempdir()?;
        let path = directory.path().join("cover.png");
        fs::write(&path, PNG)?;
        let source = Url::from_file_path(&path)
            .map_err(|()| "temporary artwork path was not representable")?
            .to_string();
        let mut loader = ArtworkLoader::default();

        let artwork = loader
            .load(&source)
            .await
            .ok_or("valid local artwork was not loaded")?;
        assert_eq!(artwork.format, i32::from(ArtworkFormat::Png));
        assert_eq!(artwork.data, PNG);

        let invalid_path = directory.path().join("invalid.png");
        fs::write(&invalid_path, b"not an image")?;
        let invalid_source = Url::from_file_path(&invalid_path)
            .map_err(|()| "temporary invalid path was not representable")?
            .to_string();
        assert_eq!(loader.load(&invalid_source).await, None);
        fs::write(&invalid_path, JPEG)?;
        assert_eq!(
            loader.load(&invalid_source).await.map(|value| value.format),
            Some(i32::from(ArtworkFormat::Jpeg))
        );

        let oversized_path = directory.path().join("oversized.webp");
        fs::write(&oversized_path, vec![0_u8; MAXIMUM_ARTWORK_BYTES + 1])?;
        let oversized_source = Url::from_file_path(&oversized_path)
            .map_err(|()| "temporary oversized path was not representable")?
            .to_string();
        assert_eq!(loader.load(&oversized_source).await, None);
        Ok(())
    }
}
