// Creates a USD 5 budget alert on the project's billing account (alerts at 50% and 100%).
import { g, P } from './common.mjs';
const [, bi] = await g('GET', `https://cloudbilling.googleapis.com/v1/projects/${P}/billingInfo`);
const acct = bi.billingAccountName; if (!acct) throw new Error('project has no billing account');
const [, pr] = await g('GET', `https://cloudresourcemanager.googleapis.com/v3/projects/${P}`);
const [s, j] = await g('POST', `https://billingbudgets.googleapis.com/v1/${acct}/budgets`, {
  displayName: 'Wingman USD 5', budgetFilter: { projects: [pr.name] }, amount: { specifiedAmount: { currencyCode: 'USD', units: '5' } },
  thresholdRules: [{ thresholdPercent: 0.5 }, { thresholdPercent: 1.0 }] });
console.log('budget', s, s >= 300 ? JSON.stringify(j).slice(0, 300) : 'created');
