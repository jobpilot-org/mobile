# 6. Benutzer-eigene Anthropic-Schlüssel im Supabase Vault

**Status:** angenommen (Phase 3; Entschlüsselung ohne Servergeheimnis seit Phase 4)

## Kontext

Bis hierher nutzte der KI-Assistent einen gemeinsamen `ANTHROPIC_API_KEY` des Servers. Für die öffentliche Demo ist das richtig – dort sollen Besucher den Assistenten ohne eigenes Konto ausprobieren. Für angemeldete Nutzer ist ein gemeinsamer Key dagegen falsch: Jede Anfrage geht auf Kosten des Betreibers, ein Missbrauch trifft alle, und es gibt keine Zuordnung von Verbrauch zu Person.

Ein Key in der App wäre für jeden auslesbar, ein Key in der App-Datenbank (SQLite) wäre im Backup und auf dem Gerät lesbar. Der Key muss also dorthin, wo er verschlüsselt liegt und nur der jeweilige Nutzer ihn über eine geprüfte Sitzung entschlüsseln kann.

## Entscheidung

- **Ein Key je Supabase-Konto, gespeichert als Vault-Secret.** `vault.secrets` verschlüsselt den Wert mit dem projektweiten Schlüssel des Vault; `public.ai_api_keys` enthält nur `user_id`, die ID des Secrets und Zeitstempel – weder Klartext noch Chiffrat.
- **Schreiben nur über RPCs, nie über die Tabelle.** `save_ai_api_key` speichert oder ersetzt den Key des Aufrufers, `delete_ai_api_key` löscht ihn. Beide leiten die Eigentümerschaft aus `auth.uid()` ab; die Tabelle ist für `anon` und `authenticated` schreibgeschützt und per RLS auf die eigene Zeile begrenzt.
- **Entschlüsseln nur für den Aufrufer selbst.** `get_ai_api_key()` hat keinen Parameter: Die Funktion liest allein über `auth.uid()` die eigene Metadatenzeile und deren Vault-Secret. Ausführungsrecht hat nur `authenticated`; `anon` und `service_role` haben keines. Alle Security-Definer-Funktionen setzen `search_path = ''`, qualifizieren Objekte aus und haben explizite Grants.
- **Aufräumen gehört zur Löschung.** Ein Trigger auf `ai_api_keys` entfernt das zugehörige Vault-Secret, auch wenn die Zeile über `on delete cascade` mit dem Auth-Nutzer verschwindet. Ersetzen aktualisiert das bestehende Secret, statt ein zweites anzulegen.
- **Ausweisung über den Bearer-Token.** Die App schickt bei jeder Nicht-Demo-Anfrage `Authorization: Bearer <access-token>` der aktuellen Supabase-Session. Der Server prüft das Token bei Supabase, ermittelt daraus die Nutzer-ID für das Rate-Limit und liest den Key über denselben Token-Client – IDs aus Body oder Headern zählen nicht.
- **Kein Servergeheimnis.** Der Server baut je Anfrage einen Supabase-Client aus `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` und dem Bearer-Token des Aufrufers. PostgREST und Postgres prüfen Token und Eigentümerschaft; ein Schlüssel mit Service-Rolle wird nicht mehr gebraucht, und der Client wird nicht zwischen Anfragen geteilt.
- **Ein Anthropic-Client je Anfrage.** Der Server baut den Client mit dem Key des Aufrufers; nichts wird pro Key zwischengespeichert oder zwischen Nutzern geteilt.
- **Die Demo bleibt unverändert.** Mit `JOBPILOT_DEMO=1` gilt weiter der Server-Key, ohne Anmeldung, mit Demo-Inhalten, eigenem Limit und Zwischenspeicher.
- **Die App zeigt Keys nie an.** Die Einstellungen lesen nur die Metadatenzeile (`updated_at`), das Eingabefeld ist ein Passwortfeld und wird nach dem Speichern geleert. Gespeichert wird, sobald die Eingabe nicht leer ist und keinen Leerraum enthält; ein festes Key-Präfix wird nicht verlangt, weil Key-Formate sich ändern können. Ob der Key gilt, zeigt die nächste Anfrage an Claude.

## Konsequenzen

- Bestehende Nicht-Demo-Nutzer müssen nach dem Deployment einmalig einen eigenen Key hinterlegen; ein gemeinsamer Key lässt sich nicht sinnvoll auf Personen verteilen.
- Speichern kostet keinen Anthropic-Aufruf, prüft den Key aber auch nicht. Ein abgelehnter Key führt erst beim nächsten KI-Aufruf zu einer verständlichen Fehlermeldung mit Verweis auf die Einstellungen.
- `EXPO_PUBLIC_SUPABASE_URL` und `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` sind öffentlich und genügen App und Server; ein Servergeheimnis gibt es nicht mehr. Der Preis dafür: Wer ein gültiges Sitzungs-Token eines Nutzers besitzt, kann dessen eigenen Klartext-Key lesen und nicht nur die KI-Routen aufrufen. Der Key gehört dem Nutzer, der Schaden bleibt also auf dessen Anthropic-Verbrauch begrenzt.
- Der Vault verschlüsselt mit einem Schlüssel des Projekts. Ein Umzug in ein anderes Supabase-Projekt braucht diesen Schlüssel – sonst müssen alle Nutzer ihren Key neu eingeben.
- Ein Rollback der App- und API-Änderungen lässt die Datenbankobjekte stehen und damit die Keys unangetastet; erst ein bewusstes Entfernen der Tabelle samt Secrets zwingt alle zu neuen Keys.
