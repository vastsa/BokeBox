---
description: BokeBox Docker CI/CD with GitHub Actions and GHCR.
---

# Docker CI/CD

GitHub Actions + GHCR image build, optional SSH deploy.

## Pipeline

```text
PR / push
  ├─ check     pnpm install + full build
  └─ docker    build image
                 ├─ PR: load + /api/health smoke
                 └─ main / tag / manual: push GHCR (amd64 + arm64)

main push / manual deploy
  └─ deploy    SSH pull + compose up (secrets required)
```

## Image

```text
ghcr.io/<owner>/<repo>
# e.g. ghcr.io/vastsa/bokebox
```

| Tag | Meaning |
| --- | --- |
| `latest` | latest `main` |
| `sha-<short>` | commit |
| `1.2.3` | git tag `v1.2.3` |

## Related

- [Deployment](../guide/deployment.md)
- [Configuration](../guide/configuration.md)
- Chinese full notes: [/ops/ci-cd](/ops/ci-cd)
