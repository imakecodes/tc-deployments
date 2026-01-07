const Sentry = require("@sentry/node");
const { InfluxDB, Point } = require('@influxdata/influxdb-client');

const {
    SERVICE = "unknown-service",
    COMPONENT = "deployment",
    SENTRY_DSN = "",
    AUTH = "",
    DEPLOY_IMAGE = "hello-world",
    DEPLOY_VERSION = "qa",
    DEPLOY_WEBHOOK_URL = "https://n8n.ops.makecodes.dev/webhook/deployments",
    DEPLOY_TIMEOUT_MS = "3600000",
    ENABLE_INFLUXDB = "false",
    INFLUXDB_URL = "",
    INFLUXDB_TOKEN = "",
    INFLUXDB_ORG = "",
    INFLUXDB_BUCKET = "",
    ORGANIZATION = "",
    REPOSITORY = "",
} = process.env;

const fetchFn = global.fetch;
const { AbortSignal } = global;

if (typeof fetchFn !== "function" || !AbortSignal?.timeout) {
    throw new Error("Required web APIs (fetch, AbortSignal.timeout) are unavailable.");
}

if (SENTRY_DSN) {
    Sentry.init({
        dsn: SENTRY_DSN,
        sendDefaultPii: false,
        enableLogs: true,
        environment: "ci",
        _experiments: {
            enableMetrics: true,
        },
    });
}

const logger = SENTRY_DSN ? Sentry.logger : {
    info: (msg, ...args) => console.log(msg, ...args),
    error: (msg, ...args) => console.error(msg, ...args),
    debug: (msg, ...args) => console.debug(msg, ...args),
    fmt: (strings, ...values) => {
        return strings.reduce((result, str, i) => {
            return result + str + (values[i] || "");
        }, "");
    }
};

const baseMetricAttributes = {
    environment: "ci",
    service: SERVICE,
    component: COMPONENT,
    organization: ORGANIZATION,
    repository: REPOSITORY,
};

let influxWriteApi;
if (ENABLE_INFLUXDB === 'true' && INFLUXDB_URL && INFLUXDB_TOKEN && INFLUXDB_ORG && INFLUXDB_BUCKET) {
    const influxDB = new InfluxDB({ url: INFLUXDB_URL, token: INFLUXDB_TOKEN });
    influxWriteApi = influxDB.getWriteApi(INFLUXDB_ORG, INFLUXDB_BUCKET);
}

const logInfluxError = (error, action = "operation") => {
    logger.error(`InfluxDB ${action} failed`, { error: error?.message || error });
};

const writeInfluxPoint = ({ name, value, attributes = {}, unit }) => {
    if (!influxWriteApi) return;
    try {
        const point = new Point(name).floatField('value', value);

        const allAttributes = { ...baseMetricAttributes, ...attributes };
        for (const [key, val] of Object.entries(allAttributes)) {
            point.tag(key, String(val));
        }
        if (unit) point.tag('unit', unit);

        influxWriteApi.writePoint(point);
    } catch (error) {
        logInfluxError(error, 'write');
    }
};

const METRIC_NAMES = {
    WEBHOOK_ATTEMPT: "deploy.webhook_attempt",
    WEBHOOK_FAILURE: "deploy.webhook_failure",
    WEBHOOK_SUCCESS: "deploy.webhook_success",
    WEBHOOK_DURATION: "deploy.webhook_duration_ms",
    RUN_STARTED: "deploy.run_started",
    RUN_SUCCEEDED: "deploy.run_succeeded",
    RUN_FAILED: "deploy.run_failed",
    RUN_DURATION: "deploy.run_duration_ms",
};

const metrics = {
    count: (name, value = 1, attributes = {}) => {
        if (SENTRY_DSN) {
            Sentry.metrics?.count?.(name, value, {
                attributes: { ...baseMetricAttributes, ...attributes },
            });
        }

        writeInfluxPoint({ name, value, attributes });
    },
    distribution: (name, value, { unit, attributes = {} } = {}) => {
        if (SENTRY_DSN) {
            Sentry.metrics?.distribution?.(name, value, {
                ...(unit && { unit }),
                attributes: { ...baseMetricAttributes, ...attributes },
            });
        }

        writeInfluxPoint({ name, value, attributes, unit });
    },
};

const requireEnv = (value, name) => {
    if (!value) {
        logger.error(logger.fmt`Missing required environment variable '${name}'.`);
        throw new Error(`Missing required environment variable '${name}'.`);
    }
    return value;
};

const triggerDeployment = async () => {
    requireEnv(AUTH, "AUTH");
    requireEnv(DEPLOY_WEBHOOK_URL, "DEPLOY_WEBHOOK_URL");

    const payload = {
        service: SERVICE,
        image: DEPLOY_IMAGE,
        version: DEPLOY_VERSION,
        component: COMPONENT,
        organization: ORGANIZATION,
        repository: REPOSITORY,
    };

    const signal = AbortSignal.timeout(Number(DEPLOY_TIMEOUT_MS) || 3600000);

    logger.info(
        logger.fmt`Starting deployment for '${SERVICE}' using version '${DEPLOY_VERSION}'.`,
        payload
    );

    metrics.count(METRIC_NAMES.WEBHOOK_ATTEMPT, 1);

    const webhookStart = Date.now();
    const response = await fetchFn(DEPLOY_WEBHOOK_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${AUTH}`,
        },
        body: JSON.stringify(payload),
        signal,
    });

    metrics.distribution(METRIC_NAMES.WEBHOOK_DURATION, Date.now() - webhookStart, {
        unit: "millisecond",
        attributes: { status: response.status },
    });

    const bodyText = await response.text();

    logger.debug("Deployment webhook response body", {
        service: SERVICE,
        status: response.status,
        body: bodyText,
    });

    if (!response.ok) {
        metrics.count(METRIC_NAMES.WEBHOOK_FAILURE, 1, { status: response.status });
        logger.error(
            logger.fmt`Deployment failed for '${SERVICE}' with status '${response.status}'.`,
            { body: bodyText }
        );
        throw new Error(
            `Deployment failed for '${SERVICE}' with status '${response.status}'.`
        );
    }

    metrics.count(METRIC_NAMES.WEBHOOK_SUCCESS, 1, { status: response.status });
    logger.info(
        logger.fmt`Deployment succeeded for '${SERVICE}' with status '${response.status}'.`
    );
};

async function main() {
    metrics.count(METRIC_NAMES.RUN_STARTED, 1);
    const startedAt = Date.now();
    let success = false;

    try {
        await triggerDeployment();
        success = true;

        metrics.count(METRIC_NAMES.RUN_SUCCEEDED, 1);
        logger.info(logger.fmt`Deployment script completed for '${SERVICE}'.`);
    } catch (error) {
        metrics.count(METRIC_NAMES.RUN_FAILED, 1, {
            reason: error?.name || "Error",
        });
        logger.error("Failed to run deployment script", {
            error: error.stack || error,
        });
    } finally {
        metrics.distribution(METRIC_NAMES.RUN_DURATION, Date.now() - startedAt, {
            unit: "millisecond",
            attributes: { status: success ? "success" : "failure" },
        });

        if (SENTRY_DSN) {
            await Sentry.flush(5000);
        }

        if (influxWriteApi) {
            try {
                await influxWriteApi.close();
                logger.info('InfluxDB metrics flushed.');
            } catch (e) {
                logger.error('Error flushing InfluxDB metrics', e);
            }
        }

        if (!success) {
            process.exit(1);
        }
    }
}

main();
