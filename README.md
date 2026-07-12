# Spotify Now Playing

Spotify Now Playing is a small NextJS/React app designed to display the currently playing song from Spotify, allowing integration with OBS Studio for streaming or recording.

![Example](./docs/example.gif)

## Prerequisites

- **Node.js** (v14.x or later)
- **npm** (v6.x or later)
- **Prisma** for database management
- **Spotify Developer Account** (to generate Client ID and Secret)

## Setup & Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/alsi-lawr/obs-nowplaying.git
   cd obs-nowplaying
   ```

2. Install the necessary dependencies:

   ```bash
   npm install
   ```

3. Run Prisma to generate the database client:

   ```bash
   npx prisma generate
   ```

## Configuration

The configuration is managed through the `appconfig.json` file. A sample file `example.appconfig.json` is provided in the repository.

1. Copy `example.appconfig.json` to `appconfig.json`:

   ```bash
   cp example.appconfig.json appconfig.json
   ```

2. Edit the `appconfig.json` file to add your Spotify Client ID and Client Secret under the `authorization` section:

```json
{
  "authorization": {
    "authorizationAddress": "https://accounts.spotify.com/authorize",
    "scopes": "user-read-playback-state user-read-currently-playing user-modify-playback-state",
    "responseType": "code",
    "callbackAddress": "http://localhost:45000/nowplaying",
    "spotifyClientId": "your-client-id",
    "spotifyClientSecret": "your-client-secret"
  },
  "trackAgent": {
    "currentlyPlayingAddress": "https://api.spotify.com/v1/me/player/currently-playing",
    "spotifyTrackRefreshIntervalMs": 5000,
    "artworkSize": "large"
  },
  "refresh": {
    "authTokenRefreshAddress": "https://accounts.spotify.com/api/token",
    "authTokenRefreshIntervalMs": 30000
  }
}
```

> [!CAUTION]
> The spotify API addresses are exposed in case spotify change their API locations, although this is unlikely. Do not change these unless you know they have changed.
> Change the auth token refresh interval at your own risk.

> [!TIP]
> If you need a less responsive client, just lower the `spotifyTrackRefreshIntervalMs` in the `trackAgent` section.
> If you don't need the artwork to be as large, you can choose from 3 options: `small`, `medium` or `large`.

### How to Generate Spotify Client ID and Secret

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/applications).
2. Log in with your Spotify account and create a new application.
3. After creating the app, you'll see your **Client ID** and **Client Secret** on the app page.
4. Set the **Redirect URI** in the app to: `http://localhost:45000/nowplaying`.
5. Enter the **Client ID** and **Client Secret** into the `appconfig.json`.

## Running the Application

### Locally

#### Building

To build the application for production from a fresh repository, run:

```bash
npm run clean && npm run init && npm run migrate && npm run build
```

#### Starting

To start the application:

```bash
npm start
```

The app will be available at `http://localhost:3000`. Ensure that your `appconfig.json` is configured correctly to callback to this port.

#### In dev mode

You can start the app in dev mode by running:

```bash
npm run dev
```

### Using Docker

Ensure you have a fully configured appconfig.json file in the directory you run this from.
To start the application using Docker:

```bash
docker run -d --name obs-nowplaying -p 45000:3000 -v ./appconfig.json:/app/appconfig.json alsilawr/obs-nowplaying:1.0.0
```

If you want to persist the local database of artists/tracks/album artworks then run the following:

```bash
docker run -d --name obs-nowplaying -p 45000:3000 -v ./appconfig.json:/app/appconfig.json -v prisma:/app/prisma alsilawr/obs-nowplaying:1.0.0
```
