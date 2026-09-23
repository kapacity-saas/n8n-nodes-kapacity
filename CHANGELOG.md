# Changelog

## 0.1.1

- Kapacity Trigger: each webhook gets its own secret header (`X-Kapacity-Key`), checked on every call on top of the signature, and visible in Kapacity. A webhook created by 0.1.0 is recreated with it the next time the workflow is activated.
- Kapacity Trigger: the event names are shown under the node, instead of their codes.

## 0.1.0

- Kapacity node: contacts (create, create or update by e-mail, get, get many, update, delete), rows of your own tables, tables and their columns, contracts (send for e-signature, get, get many), contract templates, appointments, appointment types, forms, form responses, products, payments, members, workspace.
- Kapacity Trigger: 11 events, webhook registered and deleted with the workflow, signature checked on every call.
