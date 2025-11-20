# Agents Documentation

## Purpose
This action is designed to automate the deployment process by triggering a webhook and reporting the status and metrics to monitoring services (Sentry and InfluxDB). It is intended to be used within GitHub Actions workflows.

## Architecture

The action consists of:
1.  `action.yml`: Defines the inputs and the execution steps. It sets up Node.js, installs dependencies using `pnpm`, and runs the `main.js` script.
2.  `main.js`: The core logic script.
    -   Validates environment variables.
    -   Initializes Sentry (optional).
    -   Initializes InfluxDB (optional).
    -   Triggers the deployment webhook.
    -   Collects and sends metrics.
    -   Handles errors and logging.

## Interaction

Agents interacting with this repository should be aware of the following:

-   **Configuration**: The action is highly configurable via inputs defined in `action.yml`.
-   **Dependencies**: The project uses `pnpm` for package management.
-   **Error Handling**: The script exits with code 1 on failure, which will fail the GitHub Action step.
-   **Observability**:
    -   **Logs**: Output to stdout/stderr. If Sentry is enabled, logs are also sent to Sentry.
    -   **Metrics**: Sent to Sentry and/or InfluxDB based on configuration.

## Key Files

-   `action.yml`: Action definition.
-   `main.js`: Main execution script.
-   `package.json`: Node.js dependencies.

## Development

When modifying this action:
1.  Ensure `action.yml` inputs match the environment variables used in `main.js`.
2.  If adding new dependencies, use `pnpm install` and commit the updated `package.json` and `pnpm-lock.yaml` (if present, though currently not tracked in the file list provided).
3.  Test changes locally if possible, or via a test workflow.
