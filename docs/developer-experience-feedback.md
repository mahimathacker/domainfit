# Nugen Developer Experience Feedback

This document records observations from running the DomainFit alignment workflow against the live Nugen API and dashboard on 2 August 2026.

## Deployment behavior

The domain alignment completed successfully, and Nugen returned a ready aligned-model ID. Deployment was then requested through the documented API workflow:

1. `POST /api/v3/models/deploy-model/{model_id}` accepted the request.
2. `GET /api/v3/models/deploy-model/{model_id}/status` moved from `PENDING` to `FAILED`.
3. The task result reported: `Redeployment failed and was reverted to READY status`.
4. `GET /api/v3/models/aligned` and the dashboard both showed the model as undeployed and ready to deploy.
5. Deploying the same model from the Nugen dashboard succeeded.

This indicates a difference between API-triggered and dashboard-triggered deployment behavior. The alignment artifact itself remained valid throughout the process.

## Developer impact

- The API error did not explain why the request was treated as a redeployment.
- The model-level `READY` status and deployment-task statuses represent different lifecycle states and are easy to confuse.
- The useful failure message is nested under `result.error`; clients must inspect that field explicitly.
- A developer cannot determine from the failure response whether retrying the API request is safe or billable.
- Successful dashboard deployment provides a workaround, but it interrupts an otherwise automatable workflow.

## Suggested improvements

- Make API and dashboard deployment behavior consistent.
- Return a specific error code and actionable reason when deployment or redeployment fails.
- Clarify the distinction between alignment status, model status, and deployment-task status in one lifecycle example.
- Document whether a failed deployment request consumes credits and when retrying is safe.
- Provide an idempotent deployment operation or an idempotency key so clients can resume safely after uncertain responses.
- Show the deployment task ID and detailed provider error in both the API response and dashboard.

## Positive observations

- A failed deployment safely reverted the model to a deployable state instead of damaging the completed alignment.
- The dashboard clearly displayed the model as undeployed and provided a successful recovery path.
- The dedicated deployment-status endpoint exposed a bounded `PENDING`, `COMPLETED`, or `FAILED` lifecycle.
