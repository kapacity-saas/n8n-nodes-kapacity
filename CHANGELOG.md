# Changelog

## 0.1.5

- Credentials: a Base URL pasted with the API path (`https://kapacity.app/api/v1/w/<workspace>`) is brought back to the Kapacity address. The node adds `/api/v1/w/<workspace>` itself: the doubled path reached nothing, so lists stayed empty without any error. The credential test applies the same rule.
- Clear messages for the two new error codes of the API: `adresse_de_base` (the Base URL already contains the API path) and `adresse_inconnue` (an address that does not exist).
- The Base URL field says what to put in it: the Kapacity address only.

## 0.1.4

- Contact, Move: moves a contact from Setting to Mon Pipe, or back, with the rules of the Base menu of its record in Kapacity. It stays the same contact (same ID, appointments, answers and contracts), its status becomes the default status of the new base, the automations of the new base run, and a contact moved to Mon Pipe stays visible in Setting, marked as handed over. Moving a contact to the base it is already in returns it unchanged.
- Contact, Create: the description says that an e-mail or a phone alone is enough to create a contact.

## 0.1.3

- Loads on n8n instances that kept an old copy of n8n-workflow (before 1.90) in ~/.n8n/nodes, typically after an upgrade from n8n 1.x. n8n strips the peer dependencies of a community package, so the node used that copy, which has no NodeConnectionTypes, and the install failed with "Class could not be found". NodeConnectionTypes.Main is still used whenever it exists, with "main" as the fallback.

## 0.1.2

- Kapacity Trigger: when an outdated webhook is replaced, a failure to delete it is no longer silent. Only a 404 (already deleted in Kapacity) is ignored; any other error is raised, so the old webhook can never stay registered next to the new one and fire the workflow twice.

## 0.1.1

- Kapacity Trigger: each webhook gets its own secret header (`X-Kapacity-Key`), checked on every call on top of the signature, and visible in Kapacity. A webhook created by 0.1.0 is recreated with it the next time the workflow is activated.
- Kapacity Trigger: the event names are shown under the node, instead of their codes.

## 0.1.0

- Kapacity node: contacts (create, create or update by e-mail, get, get many, update, delete), rows of your own tables, tables and their columns, contracts (send for e-signature, get, get many), contract templates, appointments, appointment types, forms, form responses, products, payments, members, workspace.
- Kapacity Trigger: 11 events, webhook registered and deleted with the workflow, signature checked on every call.
