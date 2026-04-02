# Shared backend image deployment

This backend repository publishes one shared Docker image to GHCR:

- `ghcr.io/<owner>/shared-medusa-backend:<tag>`

Workflow:

- GitHub Actions workflow: `.github/workflows/publish-ghcr.yml`
- Push to `main` -> updates `:latest` and `:sha-<commit>` tags
- Push `vX.Y.Z` tag -> publishes semver tags

## Recommended deployment pattern

Use **separate deployment repositories** (or folders) per shop/domain, each with its own:

- `docker-compose.yml`
- `.env` (secrets)

But both point to the same backend image.

Example image pin:

```yaml
image: ghcr.io/nagyvikt/shared-medusa-backend:latest
```

For safer rollouts pin explicit version tags instead of `latest`.
