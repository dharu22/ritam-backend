# RITAM Backend — Technical Answers

## 1. Why should `tenant_id` come from the login token and not from the request body?

The server should get `tenant_id` from the verified login token because the token identifies the authenticated user's tenant. If the server trusts the request body, a user could change the tenant ID and try to access another college's data. Using the token helps enforce tenant isolation.

## 2. Why should the status update and the verification log entry happen in one database transaction?

Both operations are related and must succeed or fail together. If the status changes but the log entry fails, the system loses the audit record. If the log is inserted but the status update fails, the log becomes misleading. A database transaction keeps both changes consistent.

## 3. If the email service is down when an activity is approved, should the approval fail?

No. The approval should succeed even if the email service is temporarily unavailable. The system should commit the status update and verification log in a database transaction, then send the email separately. Failed email delivery can be retried using a background job or retry queue.

## 4. What problems could occur when downloading 2,000 certificates as one ZIP file, and how would you handle them?

Creating a large ZIP file could use too much memory, take a long time, or cause a request timeout. Some files may also be missing or unreadable. I would stream files into the ZIP instead of loading them all into memory, process the job in the background, report missing files, and provide a download link when the ZIP is ready.

## 5. If you had two more days, what would you improve in your submission?

I would expand the automated or Postman tests for tenant isolation, missing files, verification permissions, and report calculations. I would also review database constraints, improve error handling and logging, and verify the setup instructions on a fresh environment.