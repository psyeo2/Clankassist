# REST API Template

Basic Express + TypeScript starter with:

- global request logging
- versioned routing via `/api/<version>`
- consistent JSON responses
- centralized 404 and error handling
- minimal health endpoint

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Copy the example environment file if needed:

```bash
cp .env.example .env
```

3. Start the development server:

```bash
npm run dev
```

## Environment Variables

```env
PORT=3001
API_VERSION=v1
```

- `PORT` sets the HTTP server port.
- `API_VERSION` sets the route version segment. The effective base path is `/api/<API_VERSION>`.

## Scripts

- `npm run dev` starts the API with `nodemon` and `ts-node`.
- `npm run build` compiles TypeScript to `dist/`.
- `npm run start` runs the compiled server from `dist/`.
- `npm run typecheck` runs TypeScript without emitting output.

## Example Routes

- `GET /api/v1/ping`

Example response:

```json
{
  "status": 200,
  "message": "Ok",
  "data": {
    "uptime": 12.345
  }
}
```

Unknown routes return a 404 response with the requested path. Unhandled errors return a consistent 500 response.

## Project Structure

```text
src/
  controllers/   Route handlers
  middlewares/   Logging, 404, and error middleware
  router/        Route registration
  utils/         Shared helpers
  index.ts       App bootstrap
```
