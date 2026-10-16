# Live radio

Open the radio icon beside the Blower in scene controls, choose **Live radio** inside the Blower, or right-click an occupied vehicle and choose **Car radio**. The character sheet also has a radio button.

Choose a preset or use the previous/next buttons, then press **Listen**. Volume and mute affect your device only. **Stop listening** disconnects the stream. Closing a window leaves the broadcast playing.

## Car and phone

The seated driver chooses the car’s station and can switch its radio on or off. Every passenger can listen, with separate local volume and mute. The GM can tune any vehicle, including an empty car. Being able to control a vehicle token does not let a passenger change its station.

When you board, the receiver follows the car’s station. Getting out restores your character’s saved phone preset. Map crossings carry the car’s station and power with it; an unchanged stream continues without being reconnected. A single local receiver prevents the phone and car playing over one another.

If you control several characters, choose the one you are listening as in the Blower or radio window. Phone presets and volume are remembered on that browser for that world. Car presets are saved with the vehicle token and are shared across connected clients. Players need a connected GM to tune the shared car; phone tuning works independently.

## Supplied presets

| Preset | Music | Station | Directory listing |
| --- | --- | --- | --- |
| Point Blank FM | House, soul, underground | [Website](https://www.pointblankradio.com/) | [radio.net](https://uk.radio.net/s/pointblankfm) |
| Rude FM | Drum & bass, jungle | [Website](https://rudefm.com/) | [radio.net](https://uk.radio.net/s/rudefm) |
| Vision Radio UK | House, garage, soul | [Website](https://visionradiouk.com/) | [radio.net](https://uk.radio.net/s/visionradiouk) |
| Flex FM | House, garage, bass | [Website](https://flexfm.co.uk/) | [radio.net](https://uk.radio.net/s/flexfm) |
| Supreme FM | Soul, R&B, reggae | [Website](https://supremefm.com/) | [radio.net](https://uk.radio.net/s/supremefm) |
| Radio Caroline UK | Rock, pop, album tracks | [Website](https://www.radiocaroline.co.uk/) | [radio.net](https://uk.radio.net/s/radiocaroline) |

These are six presets selected from the [pirate-radio list supplied for the game](https://uk.radio.net/topic/interests/pirate-radio). **More pirate stations** opens the full list.

## Message the studio

Under the station display, open **Message the studio**, type a shout-out, request or big up (up to 500 characters), and pick one of that station's own channels:

- **Studio chat** opens the station's own chat room or message box in a Foundry window, so you post through the station's system without leaving the game. Your message is copied as the window opens: paste it into their box and post it under whatever name their chat asks for. You see the live chat and replies there too.
- **WhatsApp**, **Text** and **Email** open your own WhatsApp, Messages or mail app with the message already filled in. You press send there; nothing is sent from Foundry.
- **Their site** copies your message to the clipboard and opens the station's message box or chat, ready to paste.
- **Call** rings the studio line.

Messages go to the real broadcaster, live, from your own account, number or chat name, so keep them friendly. Tick **Show the table what you sent** to post it in chat as well. Your unsent message stays in the box while the radio panel redraws.

| Preset | Message channels supplied | Source |
| --- | --- | --- |
| Point Blank FM | Studio chat (the homepage "Message the Studio" box, shown in Foundry if their site allows it), their site, studio phone | [pointblankradio.com](https://www.pointblankradio.com/), [contact](https://www.pointblankradio.com/contact) |
| Rude FM | Studio chat (their Chatroll room, built to be embedded), text the studio (shout-out line), email, shoutbox, studio phone | [rudefm.com](https://rudefm.com/) |
| Vision Radio UK | Studio chat (their Minnit listener chatbox, built to be embedded), their site | [visionradiouk.com](https://visionradiouk.com/) |
| Flex FM | WhatsApp, email, contact page, phone | [flexfm.co.uk](https://flexfm.co.uk/) |
| Supreme FM | Email and phone from a radio directory listing (their site blocks automated checks: worth confirming) | [onlineradiobox.com](https://onlineradiobox.com/uk/supreme/) |
| Radio Caroline UK | The Album Channel on-air studio email "for messages to the presenter", contact page | [radiocaroline.co.uk/contact](http://www.radiocaroline.co.uk/contact.html) |

Checked 15 October 2026. Stations change their numbers; the GM can update any of them in **Edit presets** (WhatsApp, text and phone numbers as +44 …; UK numbers starting 0 are accepted).

### Why the studio chat is a window, not a send button

None of these stations publishes a messaging API. Their message boxes are private parts of their own sites (Chatroll, Minnit, or the station's own widget), and browsers stop one site posting into another's on a visitor's behalf. Posting from Foundry would mean copying their private endpoints, which breaks whenever they change their site and gets round the spam protection they rely on. So the Studio chat window shows their real chat, and you type into it exactly as you would on their website.

Chatroll and Minnit chats are made to be placed on other sites and work in the window. A station page can forbid being shown inside other sites; then the window stays blank or shows a "refused to connect" page, and **Open on their site** opens it in your browser instead. Point Blank's box is on their homepage, so the window shows the whole page; scroll to the box. Some chats ask you to pick a name first, and a browser that blocks third-party cookies may ask you to sign in again or keep you as a guest.

On a phone or tablet the WhatsApp, text and call buttons hand straight to the apps. On a desktop they use whatever the computer has set up for WhatsApp links, `sms:` and `mailto:` (WhatsApp Web, Phone Link or Messages, your mail client); the number or address is always shown under the buttons to send by hand.

## GM configuration

Open **Edit presets** in the radio, or **Configure Settings → The Smoke → Edit radio stations**. Edit a row, add/remove stations, then **Save presets**. Each row needs a name, a direct HTTPS MP3/AAC stream, and a station website. Genres, the radio.net page and the studio contacts (a studio chat to show in Foundry, WhatsApp, text, phone, email, an HTTPS message page) are optional. For the studio chat, use the HTTPS address the station's site embeds (for a Chatroll or Minnit chat, the `chatroll.com/embed/…` or `minnit.chat/…?embed` link from their page). Presets saved before 0.2.2 or 0.2.3 keep the supplied stations' contacts. Keep between 1 and 40 presets. **Restore originals** restores the supplied list in the editor; Save applies it.

Use a broadcaster’s direct audio endpoint. A normal webpage, playlist file, HLS stream, or embedded web player cannot be entered as an MP3/AAC stream. The editor checks the URL format; it cannot guarantee a station is broadcasting. A changed preset list reaches connected clients through the world setting. If a saved preset has been removed, its receiver selects the first available preset.

The **Live pirate radio** world setting disables the feature for everyone. An existing listener resumes when it is enabled again; a player who pressed Stop stays disconnected. Radio volume is independent of Foundry’s playlist and ambient audio volume.

## Playback problems

Players press Listen after each world reload; a remote station change never enables someone who has not opted in. If a browser blocks playback, press **Resume**. If a station disconnects, stops broadcasting, or fails to load within 20 seconds, use **Retry**, tune elsewhere, or follow its website/radio.net link. No pop-up opens automatically. A failed stream stays disconnected until a retry, a source change, or a new station.

Each browser connects directly to the broadcaster and buffers independently. Riders hear the same live station, with possible delay between devices. Streams may carry adverts or become unavailable by region, network or broadcaster policy. No broadcasts, recordings or radio.net player code are bundled in the system.

The source bundle contains automated playback/state checks, real Chromium control checks, and timestamped endpoint responses. The Foundry/Forge acceptance checklist is in VALIDATION.md.
