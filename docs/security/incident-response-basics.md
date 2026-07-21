# Incident response basics

1. **Suspect compromised account** — block user (`users:manage`), logout-all sessions, rotate JWT secrets if keys leaked.
2. **Refresh reuse detected** — family already revoked; force re-login; review AuditLog `TOKEN_REUSE_DETECTED`.
3. **DB credential leak** — rotate DB passwords and JWT secrets; re-deploy with new env; review AuditLog for anomalous actorIds.
4. **Preserve evidence** — do not truncate `audit_logs`; export relevant rows.
5. **Communication** — notify organization DIRECTOR; document timeline.

Follow-up: change production passwords for all privileged users if unscoped leak is confirmed.
