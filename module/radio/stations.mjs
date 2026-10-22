// Only broadcasters with a supported direct feed ship as default tuner presets.
// CodeSouth and Esencia Urbana have official web players, but no verified direct media URLs.
// Neither may appear as a dead/Retry preset. A GM may re-add one with their own stream.
// The directory links identify the supplied six stations.
export const RADIO_DIRECTORY='https://uk.radio.net/topic/interests/pirate-radio';
// Studio contacts as each station publishes them, checked 15 October 2026 (the GM can change them in Edit presets).
// chatUrl is the station's own chat or message box, shown inside Foundry: Rude FM's Chatroll room and Vision Radio UK's
// Minnit chatbox are made to be embedded; Point Blank FM's homepage carries its Message the Studio box (if the site
// refuses to be shown inside another page, the window offers Open in browser).
// Point Blank FM — the "Message the Studio" box on its homepage, and the studio phone on its contact page.
// Rude FM — "Text the studio for a shout out" / "Call the studio", the shoutbox and info@ on its homepage.
// Vision Radio UK — the listener chatbox on its homepage (no studio line is published).
// Flex FM — WhatsApp and phone in its site footer, office@ and the contact page.
// Supreme FM — its site blocks automated reading; email and phone from a radio directory listing. Worth checking.
// Radio Caroline — studio@ is its Album Channel on-air studio address "for messages to the presenter".
export const DEFAULT_STATIONS=[
 {id:'point-blank',name:'Point Blank FM',genre:'House · soul · underground',stream:'https://pointblankradio.co.uk/stream.mp3',website:'https://www.pointblankradio.com/',directory:'https://uk.radio.net/s/pointblankfm',
  chatUrl:'https://www.pointblankradio.com/',whatsapp:'',sms:'',phone:'+447743049123',email:'',messageUrl:'https://www.pointblankradio.com/'},
 {id:'rude-fm',name:'Rude FM',genre:'Drum & bass · jungle',stream:'https://stream.rudefm.com/;',website:'https://rudefm.com/',directory:'https://uk.radio.net/s/rudefm',
  chatUrl:'https://chatroll.com/embed/chat/rudefm?platform=wordpress-org&id=7DWCu7uTjv_&uid=0&ismod=0&upic=http%3A%2F%2F0.gravatar.com%2Favatar%2F%3Fs%3D96%26r%3Dg&sig=abe108a0075ac34c5de7ff48c7fc2e82',
  whatsapp:'',sms:'+447501442882',phone:'+447501442882',email:'info@rudefm.com',messageUrl:'https://rudefm.com/#shoutbox'},
 {id:'vision-radio',name:'Vision Radio UK',genre:'House · garage · soul',stream:'https://mscp3.live-streams.nl:8202/live/',website:'https://visionradiouk.com/',directory:'https://uk.radio.net/s/visionradiouk',
  chatUrl:'https://minnit.chat/VRUKchatbox?embed',whatsapp:'',sms:'',phone:'',email:'',messageUrl:'https://minnit.chat/VRUKchatbox'},
 {id:'flex-fm',name:'Flex FM',genre:'House · garage · bass',stream:'https://stream.cotswoldgrp.com:8021/flex',website:'https://flexfm.co.uk/',directory:'https://uk.radio.net/s/flexfm',
  chatUrl:'',whatsapp:'+447704941014',sms:'',phone:'+447704941014',email:'office@flexfm.co.uk',messageUrl:'https://flexfm.co.uk/contact/'},
 {id:'supreme-fm',name:'Supreme FM',genre:'Soul · R&B · reggae',stream:'https://supremefmwebsite-friskydj.radioca.st/stream',website:'https://supremefm.com/',directory:'https://uk.radio.net/s/supremefm',
  chatUrl:'',whatsapp:'',sms:'',phone:'+442035989656',email:'info@supremefm.com',messageUrl:'https://supremefm.com/'},
 {id:'radio-caroline',name:'Radio Caroline UK',genre:'Rock · pop · album tracks',stream:'https://stream.radiocaroline.net/rc128/;',website:'https://www.radiocaroline.co.uk/',directory:'https://uk.radio.net/s/radiocaroline',
  chatUrl:'',whatsapp:'',sms:'',phone:'',email:'studio@radiocaroline.co.uk',messageUrl:'https://www.radiocaroline.co.uk/contact.html'},

];

/** Keep newer presets available in worlds which customised the six original presets before this release. */
export const NEW_RADIO_PRESETS = Object.freeze([]);
