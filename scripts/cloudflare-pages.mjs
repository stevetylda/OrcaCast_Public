import { appendFile } from "node:fs/promises";

const [command, deploymentId] = process.argv.slice(2);
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const project = process.env.CLOUDFLARE_PROJECT_NAME || "orcacast";
const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}`;

if (!accountId || !apiToken)
  throw new Error("Cloudflare account ID and API token are required");

async function request(pathname, init = {}) {
  const response = await fetch(`${base}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(
      `Cloudflare API failed (${response.status}): ${JSON.stringify(payload.errors)}`,
    );
  }
  return payload.result;
}

if (command === "current") {
  const deployments = await request("/deployments?env=production&per_page=20");
  const current = deployments.find(
    (item) =>
      item.environment === "production" &&
      item.latest_stage?.status === "success",
  );
  if (!current)
    throw new Error(
      "No successful production deployment is available for rollback",
    );
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `deployment_id=${current.id}\n`,
    );
  }
  console.log(`Recorded production deployment ${current.id}`);
} else if (command === "rollback") {
  if (!deploymentId) throw new Error("A rollback deployment ID is required");
  const result = await request(`/deployments/${deploymentId}/rollback`, {
    method: "POST",
    body: "{}",
  });
  console.log(`Rolled production back to ${result.id ?? deploymentId}`);
} else {
  throw new Error(
    "Usage: node scripts/cloudflare-pages.mjs current|rollback [deployment-id]",
  );
}
