export const ORBITA_RELAY_EVENT_TYPE = 'openclaw.orbita.background_relay.v1';

/**
 * Builds the text-only trusted event injected into the original requester
 * session. The relay envelope is assistant-private: the main assistant should
 * expose only the sanitized public card between the markers.
 */
export function buildOrbitaRelayMessage(publicCard) {
  const card = typeof publicCard === 'string' ? publicCard.trim() : '';
  return [
    '[Internal trusted Orbita relay event — assistant-private; do not quote to user]',
    `Event: ${ORBITA_RELAY_EVENT_TYPE}`,
    'Instruction for main assistant: relay only the public Orbita card below to Sergey as normal user-facing text. Do not expose or copy this relay header, Gateway/session details, or private internals.',
    '',
    '--- PUBLIC ORBITA CARD ---',
    card,
    '--- END PUBLIC ORBITA CARD ---',
  ].join('\n');
}

async function importGatewayRuntime() {
  return import('openclaw/plugin-sdk/gateway-runtime');
}

function cleanGatewaySettings(settings = {}) {
  if (!settings || typeof settings !== 'object') return undefined;
  const url = typeof settings.url === 'string' && settings.url.trim() ? settings.url.trim() : undefined;
  const token = typeof settings.token === 'string' && settings.token ? settings.token : undefined;
  const password = typeof settings.password === 'string' && settings.password ? settings.password : undefined;
  const requestTimeoutMs = Number.isFinite(settings.requestTimeoutMs) ? settings.requestTimeoutMs : 30000;
  const helloTimeoutMs = Number.isFinite(settings.helloTimeoutMs) ? settings.helloTimeoutMs : 7000;
  if (!url) return undefined;
  return { url, token, password, requestTimeoutMs, helloTimeoutMs };
}

function settingsFromExplicitEnv(env = process.env) {
  return cleanGatewaySettings({
    url: env.OPENCLAW_GATEWAY_URL,
    token: env.OPENCLAW_GATEWAY_TOKEN,
    password: env.OPENCLAW_GATEWAY_PASSWORD,
  });
}

/**
 * Sends a text-only Orbita relay event through the in-process plugin runtime
 * sessions API. This path intentionally does not depend on Gateway URL/token
 * settings: Orbita is already running inside the trusted plugin runtime.
 */
export async function sendRuntimeRequesterSessionMessage({ runtime, sessionKey, text, idempotencyKey } = {}) {
  if (!sessionKey || !text) return { sent: false, reason: 'missing_target_or_text' };
  const send = runtime?.sessions?.send;
  if (typeof send !== 'function') return { sent: false, reason: 'runtime_sessions_send_unavailable', method: 'runtime.sessions.send' };
  const result = await send.call(runtime.sessions, { key: sessionKey, message: text, idempotencyKey });
  return { sent: true, method: 'runtime.sessions.send', result };
}

/**
 * Experimental delivery path: enqueue a public-card-only system event for the
 * requester session and ask the heartbeat loop to notice it. The event text is
 * intentionally not the private relay envelope used by sessions.send.
 */
export async function enqueueRuntimeSystemEventQueueMessage({ runtime, sessionKey, text, idempotencyKey, deliveryContext } = {}) {
  if (!sessionKey || !text) return { sent: false, reason: 'missing_target_or_text' };
  const enqueueSystemEvent = runtime?.system?.enqueueSystemEvent;
  if (typeof enqueueSystemEvent !== 'function') return { sent: false, reason: 'system_event_queue_unavailable', method: 'runtime.system.enqueueSystemEvent' };
  const result = await enqueueSystemEvent.call(runtime.system, text, {
    sessionKey,
    contextKey: idempotencyKey,
    deliveryContext,
    trusted: true,
  });
  const requestHeartbeat = runtime?.system?.requestHeartbeat;
  if (typeof requestHeartbeat !== 'function') {
    return { sent: false, reason: 'system_event_queue_wake_unavailable', method: 'runtime.system.requestHeartbeat', result };
  }
  try {
    await requestHeartbeat.call(runtime.system, { source: 'other', intent: 'immediate', sessionKey, reason: 'orbita_workflow_delivery' });
  } catch {
    return { sent: false, reason: 'system_event_queue_wake_failed', method: 'runtime.system.requestHeartbeat', result };
  }
  return { sent: true, method: 'runtime.system.enqueueSystemEvent', result };
}

export function isExperimentalSystemEventQueueDeliveryEnabled({ api, pluginConfig } = {}) {
  const explicit = pluginConfig?.experimentalSystemEventQueueDelivery
    ?? pluginConfig?.orbitaExperimentalSystemEventQueueDelivery
    ?? api?.orbita?.experimentalSystemEventQueueDelivery;
  if (explicit === true || explicit === 'true' || explicit === 'system_event_queue' || explicit === 'runtime.system.enqueueSystemEvent') return true;
  const relay = pluginConfig?.workflowDeliveryRelay;
  return relay === 'system_event_queue' || relay === 'runtime.system.enqueueSystemEvent';
}

/**
 * Sends a text-only Orbita relay event through Gateway RPC sessions.send.
 * Gateway client/settings are injectable so production wiring owns config and
 * tests can prove relay behavior without legacy runtime sender fanout.
 */
export async function sendGatewayRequesterSessionMessage({ sessionKey, text, idempotencyKey, env, gatewayClientClass, settings, importRuntime = importGatewayRuntime } = {}) {
  if (!sessionKey || !text) return { sent: false, reason: 'missing_target_or_text' };
  const resolvedSettings = cleanGatewaySettings(settings) ?? settingsFromExplicitEnv(env);
  if (!resolvedSettings) throw new Error('gateway_session_relay_settings_unavailable');

  let GatewayClient = gatewayClientClass;
  if (!GatewayClient) ({ GatewayClient } = await importRuntime());
  if (typeof GatewayClient !== 'function') return { sent: false, reason: 'gateway_session_relay_unavailable' };

  let resolveHello;
  let rejectHello;
  const helloPromise = new Promise((resolve, reject) => { resolveHello = resolve; rejectHello = reject; });
  const client = new GatewayClient({
    url: resolvedSettings.url,
    token: resolvedSettings.token,
    password: resolvedSettings.password,
    clientName: 'cli',
    clientDisplayName: 'Orbita requester-session relay',
    mode: 'cli',
    scopes: ['operator.read', 'operator.write', 'operator.admin', 'operator.approvals', 'operator.pairing'],
    requestTimeoutMs: resolvedSettings.requestTimeoutMs,
    onHelloOk: resolveHello,
    onConnectError: rejectHello,
  });

  client.start();
  try {
    await Promise.race([
      helloPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('gateway_hello_timeout')), resolvedSettings.helloTimeoutMs)),
    ]);
    const result = await client.request('sessions.send', { key: sessionKey, message: text, idempotencyKey }, { timeoutMs: resolvedSettings.requestTimeoutMs });
    return { sent: true, method: 'gateway.sessions.send.adapter', result };
  } finally {
    if (typeof client.stopAndWait === 'function') await client.stopAndWait({ timeoutMs: 1500 }).catch(() => {});
    else if (typeof client.stop === 'function') await client.stop();
  }
}

export async function sendRequesterSessionMessage({ api, pluginConfig, sessionKey, text, idempotencyKey, deliveryContext } = {}) {
  if (!sessionKey || !text) return { sent: false, reason: 'missing_target_or_text' };
  if (isExperimentalSystemEventQueueDeliveryEnabled({ api, pluginConfig })) {
    try {
      const result = await enqueueRuntimeSystemEventQueueMessage({
        runtime: api?.runtime,
        sessionKey,
        text,
        idempotencyKey,
        deliveryContext,
      });
      return { ...result, attempts: 1, failedAttempts: result.sent ? [] : [{ method: result.method, error: result.reason }] };
    } catch (error) {
      return {
        sent: false,
        reason: 'system_event_queue_failed',
        method: 'runtime.system.enqueueSystemEvent',
        error: String(error?.message ?? error),
        failedAttempts: [{ method: 'runtime.system.enqueueSystemEvent', error: String(error?.message ?? error) }],
      };
    }
  }

  const relayMessage = buildOrbitaRelayMessage(text);
  const hasRuntimeSessionsSend = typeof api?.runtime?.sessions?.send === 'function';
  if (hasRuntimeSessionsSend) {
    try {
      const result = await sendRuntimeRequesterSessionMessage({
        runtime: api.runtime,
        sessionKey,
        text: relayMessage,
        idempotencyKey,
      });
      return { ...result, attempts: 1, failedAttempts: [] };
    } catch (error) {
      return {
        sent: false,
        reason: 'runtime_sessions_send_failed',
        method: 'runtime.sessions.send',
        error: String(error?.message ?? error),
        failedAttempts: [{ method: 'runtime.sessions.send', error: String(error?.message ?? error) }],
      };
    }
  }

  const hasLegacyGatewayRelay = Boolean(api?.orbita?.GatewayClient || api?.orbita?.gatewaySettings || api?.orbita?.gatewayEnv || api?.orbita?.importGatewayRuntime);
  if (!hasLegacyGatewayRelay) {
    return {
      sent: false,
      reason: 'runtime_sessions_send_unavailable',
      method: 'runtime.sessions.send',
      failedAttempts: [{ method: 'runtime.sessions.send', error: 'runtime_sessions_send_unavailable' }],
    };
  }

  try {
    const result = await sendGatewayRequesterSessionMessage({
      sessionKey,
      text: relayMessage,
      idempotencyKey,
      env: api?.orbita?.gatewayEnv,
      gatewayClientClass: api?.orbita?.GatewayClient,
      settings: api?.orbita?.gatewaySettings,
      importRuntime: api?.orbita?.importGatewayRuntime,
    });
    return { ...result, attempts: 1, failedAttempts: [] };
  } catch (error) {
    return {
      sent: false,
      reason: 'gateway_session_relay_unavailable',
      method: 'gateway.sessions.send.adapter',
      error: String(error?.message ?? error),
      failedAttempts: [{ method: 'gateway.sessions.send.adapter', error: String(error?.message ?? error) }],
    };
  }
}
