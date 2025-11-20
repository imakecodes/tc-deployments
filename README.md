# Deployment Action

This GitHub Action triggers a deployment webhook and optionally reports metrics to Sentry and InfluxDB.

## Inputs

| Input | Description | Required | Default |
| --- | --- | --- | --- |
| `service` | Service name | **Yes** | |
| `component` | Component name | **Yes** | `deployment` |
| `auth` | Basic Auth for Webhook | **Yes** | |
| `deploy_image` | Docker image to deploy | **Yes** | `git.makecodes.dev/viaartistica/crm-backend` |
| `deploy_version` | Version to deploy | **Yes** | `qa` |
| `deploy_webhook_url` | Webhook URL | **Yes** | `https://n8n.ops.makecodes.dev/webhook/viaartistica-crm-qa-deployments` |
| `sentry_dsn` | Sentry DSN for reporting | No | |
| `deploy_timeout_ms` | Timeout in milliseconds | No | `3600000` |
| `enable_influxdb` | Enable InfluxDB reporting | No | `false` |
| `influxdb_url` | InfluxDB URL | No | |
| `influxdb_token` | InfluxDB Token | No | |
| `influxdb_org` | InfluxDB Organization | No | |
| `influxdb_bucket` | InfluxDB Bucket | No | |

## Usage

```yaml
uses: ./path/to/action
with:
  service: 'my-service'
  auth: ${{ secrets.DEPLOY_AUTH }}
  sentry_dsn: ${{ secrets.SENTRY_DSN }} # Optional
  enable_influxdb: 'true' # Optional
  influxdb_url: ${{ secrets.INFLUXDB_URL }}
  influxdb_token: ${{ secrets.INFLUXDB_TOKEN }}
  influxdb_org: 'my-org'
  influxdb_bucket: 'deployments'
```

## Metrics

The action collects the following metrics:

- `deploy.webhook_attempt`: Counter, incremented when webhook is called.
- `deploy.webhook_failure`: Counter, incremented on webhook failure.
- `deploy.webhook_success`: Counter, incremented on webhook success.
- `deploy.webhook_duration_ms`: Distribution, duration of the webhook call.
- `deploy.run_started`: Counter, incremented when script starts.
- `deploy.run_succeeded`: Counter, incremented when script succeeds.
- `deploy.run_failed`: Counter, incremented when script fails.
- `deploy.run_duration_ms`: Distribution, total duration of the script.

Metrics are sent to Sentry (if `sentry_dsn` is provided) and InfluxDB (if `enable_influxdb` is 'true').
