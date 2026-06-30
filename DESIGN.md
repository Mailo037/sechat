# Sechat Design Notes

Diese Datei beschreibt die aktuelle UI-Sprache von Sechat und soll neue Arbeit an
Menues, Popovers, Modals und Composer-nahen Controls fuehren. Der Composer ist die
beste Referenz im Produkt und soll visuell erhalten bleiben.

## Design-Richtung

Sechat ist eine minimale Dark-Chat-App. Die Oberflaeche bleibt schwarz, grau,
kompakt und ruhig. Neue UI soll sich wie ein Teil des bestehenden Chat-Clients
anfuehlen, nicht wie ein generisches Dashboard oder eine helle Einstellungsseite.

Referenzdateien:

- `src/App.css`: Hauptsprache fuer Chat, Composer, Menues und Modals.
- `src/App.tsx`: Struktur fuer Top-Chrome, Panels, Composer und Message Actions.
- `src/components/ui`: lokale UI-Primitives fuer Button, Input, Modal, Select,
  Switch, Textarea und Tooltip.

## Composer als Quelle

Der Composer ist die staerkste visuelle Vorlage. Neue Controls sollen seine
Qualitaeten uebernehmen:

- Unterer Verlauf statt harter Kante: Der Composer nutzt eine transparente
  Fade-Zone nach oben. Neue Bottom- oder Floating-Controls sollten ebenfalls weich
  in den Chat eingebettet werden.
- Pill-Formen fuer direkte Aktionen: Plus, Mic, Send und kleine Icon-Aktionen sind
  rund oder pill-shaped. Rechteckige Textbuttons nur nutzen, wenn die Aktion klar
  mehr Text braucht.
- Dunkle, matte Flaechen: `#202022`, `#27272a`, `#111113` und halbtransparente
  Grautoene sind die Basis. Keine farbigen Flaechen als Standard.
- Subtile Tiefe: Borders mit `rgba(82, 82, 91, ...)`, leichte inset highlights und
  weiche Schatten. Keine grossen Glow-Effekte.
- Dichte statt Erklaertext: Kleine Labels, kurze Hilfetexte, kompakte Zeilen.
- Aktive Primaeraktion hell: Send-ready ist hell mit dunklem Icon. Das ist die
  einzige starke Kontrastaktion im Composer.
- Bewegung kurz und taktil: Hover/active bewegen Icons oder Buttons minimal. Dauer
  ca. 140 bis 180ms fuer Panel-Feedback, groessere Icon-Animationen unter 520ms.

## Top-Chrome und geoeffnete Menues

Die oberen Buttons wurden im Browser geprueft:

- Room Overview links oeffnet ein links verankertes Status-Panel.
- Admin Unlock rechts oeffnet ein kompaktes Modal.
- Notifications rechts oeffnet ein Control-Panel.
- More Options rechts oeffnet das Quick-Menue.
- More Settings im Notifications-Panel oeffnet das groessere Notification-Modal.

Diese Menues sollen dieselbe Familie bleiben:

- Top-Chrome: links `room-info-pill`, rechts `dock-buttons`.
- Dock-Buttons: 32px Icon-Buttons in einer 44px hohen Pill-Leiste.
- Popover-Anker: Panels starten ca. 48 bis 54px unter der Top-Leiste.
- Quick-Menue: kleine Kopfzeile, zwei Kacheln, danach kurze Zeilen.
- Control-Panel: Header mit Icon/Titel/Close, dann Setting-Rows.
- Vollmodal: gleiche Row-Sprache, mehr Breite, zweispaltig nur wenn Platz da ist.

## Surface-Regeln

Standard fuer Floating UI:

- Background: `rgba(17, 17, 19, 0.96)` bis `rgba(32, 32, 34, 0.98)`.
- Border: `1px solid rgba(82, 82, 91, 0.62-0.78)`.
- Radius: 16px bis 20px fuer Popovers, 22px fuer groessere Modals, 999px fuer
  Pills und Icon-Docks.
- Shadow: `var(--shadow-soft)` oder `var(--shadow-tight)`.
- Blur: `backdrop-filter: blur(18px-22px) saturate(115%)`.
- Padding: 9px bis 13px fuer kleine Menues, 16px fuer groessere Modals.
- Width: immer responsive mit `min(..., calc(100vw - ...))`.
- Max-height: immer mit `100dvh` begrenzen und intern scrollen.

## Controls

- Nutze lokale Primitives aus `src/components/ui`.
- Nutze Phosphor Icons, weil die App bereits darauf ausgerichtet ist.
- Kein neues Icon- oder UI-Stack einfuehren.
- Keine nativen `title`-Tooltips fuer App-UI. Nutze `Tooltip`,
  `TooltipLayer` oder `data-tooltip`.
- Buttons brauchen `aria-label`, wenn sie nur Icons zeigen.
- Ausklappende Buttons brauchen `aria-expanded`.
- Close-Buttons bleiben Icon-only, klein und mit Tooltip.
- Switches bleiben rechts in Setting-Rows.
- Danger-Aktionen bleiben textlich klar und rot, aber weiterhin dunkel eingebettet.

Hinweis: Beim naechsten Touch an der Media/GIF UI sollte das bestehende
`title="Tenor GIF"` durch die lokale Tooltip-Sprache ersetzt werden.

## Menue-Layouts

Quick-Menue:

- Kopfzeile mit Avatar oder Icon plus zwei Zeilen Text.
- Maximal zwei grosse Kacheln oben.
- Danach einspaltige Rows mit Icon links, Label mittig, Status rechts.
- Status-Texte kurz halten: z.B. `3/3 sounds on`, `Reload`, `0`.

Control-Panel:

- `panel-head` mit Icon/Titel und Close-Button.
- Setting-Rows als scanbare Listen.
- Label stark, Beschreibung klein und grau.
- Toggle oder Aktion rechts ausrichten.
- Wenn ein Panel laenger wird, in ein Vollmodal auslagern.

Room Overview:

- Links am Room-Pill verankern.
- Status als 2x2 Grid ist passend.
- Zukunfts- oder Disabled-Aktionen als kleine Chips, nicht als grosse CTA-Karten.

Modals:

- Fuer Admin und grosse Settings das lokale `Modal` nutzen.
- Default-Close kann visuell versteckt werden, wenn ein eigener `panel-head`
  vorhanden ist.
- Kein Marketing-Layout im Modal. Es bleibt ein Arbeitsfenster.

## Responsive Regeln

- Mobile Top-Menues bei ca. `top: 48px` halten.
- Breiten mit `calc(100vw - 18px/24px/28px)` begrenzen.
- Bottom/Composer-UI muss `env(safe-area-inset-bottom)` beruecksichtigen.
- Text in Buttons und Rows darf nicht umbrechen, wenn es ein Statuslabel ist.
- Lange URLs, Namen oder Dateinamen mit Ellipsis oder `overflow-wrap: anywhere`
  behandeln.

## Motion

- Popovers: opacity plus `y: -8` und `scale: 0.98` reicht.
- Dauer: ca. 0.18s, Ease `[0.2, 0.8, 0.2, 1]`.
- Respektiere `useReducedMotion` und `prefers-reduced-motion`.
- Keine dekorative Daueranimation ausser fuer echte Voice- oder Loading-Zustaende.

## Do

- Composer-Optik als Referenz fuer neue Eingaben, Attachments, Voice und Bottom UI.
- Kleine, klare Menues bauen, die in einer Handbewegung erfassbar sind.
- Icons und Text zusammen einsetzen, wenn die Aktion erklaert werden muss.
- Bestehende CSS-Variablen und Klassenfamilien erweitern.
- Zustaende sichtbar machen: active, hover, disabled, loading, error.

## Do Not

- Keine hellen Settings-Seiten in die dunkle App setzen.
- Keine neuen UI-Libraries neben den lokalen Primitives.
- Keine nativen Browser-Tooltips.
- Keine bunten Akzentpaletten fuer normale Controls.
- Keine grossen Cards-in-Cards fuer Menues.
- Keine langen erklaerenden Texte in Popovers.
- Den Composer nicht neu stylen, wenn eine Aenderung nicht ausdruecklich darauf
  zielt.

## Checkliste fuer neue UI

- Passt die Flaeche zu Composer, Header-Menue oder Control-Panel?
- Nutzt sie lokale UI-Primitives?
- Sind Icon-Buttons mit `aria-label` und Tooltip versehen?
- Hat jedes geoeffnete Menue eine klare Position, Max-Breite und Max-Hoehe?
- Funktioniert es bei Mobile-Breite ohne Ueberlauf?
- Gibt es sichtbare Hover-, Active-, Disabled- und Focus-Zustaende?
- Bleibt die Farbwelt schwarz/grau mit nur noetigem Kontrast?
- Wurde der Composer unveraendert gelassen?
