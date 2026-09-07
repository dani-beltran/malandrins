import type { Localized } from './locales';
export interface CharacterDefinition {
  id: string;
  name: string;
  role: Localized;
  coordinate: [number, number];
  color: number;
  skin: number;
  hair: number;
  lines: Localized[];
}
const line = (en: string, ca: string): Localized => ({ en, ca });
export const characters: CharacterDefinition[] = [
  {
    id: 'marcos',
    name: 'Marcos',
    role: line('The one with a plan', 'El dels plans'),
    coordinate: [-0.00138, 40.10273],
    color: 0xe0ae56,
    skin: 0xc28d65,
    hair: 0x322d29,
    lines: [
      line(
        'A small town has two kinds of news: what happened, and what Castor says happened.',
        'En un poble hi ha dos tipus de notícies: el que ha passat i el que Castor diu que ha passat.',
      ),
    ],
  },
  {
    id: 'castor',
    name: 'Castor',
    role: line('Wheels & questionable deals', 'Rodes i tractes dubtosos'),
    coordinate: [-0.00145, 40.1024],
    color: 0x5b9086,
    skin: 0xbf8c6b,
    hair: 0x47392d,
    lines: [
      line(
        'The little yellow car? A classic. The rattle is part of the character.',
        'El cotxet groc? Un clàssic. El soroll forma part del seu encant.',
      ),
    ],
  },
  {
    id: 'aitor',
    name: 'Aitor',
    role: line('The shortcut expert', 'L’expert en dreceres'),
    coordinate: [-0.00213, 40.1035],
    color: 0xb07351,
    skin: 0xc68d63,
    hair: 0x272b2d,
    lines: [
      line(
        'Carrer del Calvari goes uphill. My shortcut goes through three gardens. Take the street.',
        'El carrer del Calvari fa pujada. La meua drecera travessa tres jardins. Millor ves pel carrer.',
      ),
    ],
  },
  {
    id: 'oriol',
    name: 'Oriol',
    role: line('Local historian, unofficially', 'Historiador sense títol'),
    coordinate: [-0.0016, 40.10134],
    color: 0x849972,
    skin: 0xd3a07a,
    hair: 0x64533b,
    lines: [
      line(
        'These streets were here long before us. So were most of the arguments at the bar.',
        'Aquests carrers ja hi eren molt abans que nosaltres. I la majoria de discussions del bar, també.',
      ),
    ],
  },
  {
    id: 'piopol',
    name: 'Piopol',
    role: line('Always on the guest list', 'Sempre a la llista'),
    coordinate: [-0.00191, 40.10334],
    color: 0xb394b5,
    skin: 0xc68d68,
    hair: 0x362829,
    lines: [
      line(
        'I said I would bring ten people to the festival. My cousins alone make twelve.',
        'Vaig dir que portaria deu persones a la festa. Només els meus cosins ja en són dotze.',
      ),
    ],
  },
  {
    id: 'jesus',
    name: 'Jesus',
    role: line('Keeper of the spare keys', 'El de les claus de recanvi'),
    coordinate: [-0.00064, 40.10034],
    color: 0x7797a5,
    skin: 0xb88767,
    hair: 0x322e2a,
    lines: [
      line(
        'Never lend a car without writing down the mileage. Castor taught me that. Twice.',
        'No deixes mai un cotxe sense apuntar els quilòmetres. Castor m’ho va ensenyar. Dues vegades.',
      ),
    ],
  },
  {
    id: 'cogollo',
    name: 'Cogollo',
    role: line('Professional people-watcher', 'Observador professional'),
    coordinate: [-0.00112, 40.10286],
    color: 0x68885e,
    skin: 0xc9906a,
    hair: 0x413b2e,
    lines: [
      line(
        'I have been sitting here all afternoon. Very busy day. Saw three cars and a mystery.',
        'Porte tota la vesprada ací assegut. Un dia molt ocupat. He vist tres cotxes i un misteri.',
      ),
    ],
  },
  {
    id: 'vilero',
    name: 'Vilero',
    role: line('The late arrival', 'El que sempre arriba tard'),
    coordinate: [0.00147, 40.10261],
    color: 0xd18b63,
    skin: 0xc39879,
    hair: 0x353028,
    lines: [
      line(
        'I’m not late. Everybody else is suspiciously early.',
        'No arribe tard. Els altres arriben sospitosament prompte.',
      ),
    ],
  },
  {
    id: 'laila',
    name: 'Laila',
    role: line('The sound of the town', 'El so del poble'),
    coordinate: [-0.00063, 40.10162],
    color: 0xb76b58,
    skin: 0xab7958,
    hair: 0x282b2c,
    lines: [
      line(
        'A good mixtape should sound like driving home with the windows down.',
        'Una bona cinta ha de sonar com tornar a casa amb les finestres del cotxe obertes.',
      ),
    ],
  },
  {
    id: 'mihai',
    name: 'Mihai',
    role: line('Can fix just about anything', 'Ho arregla quasi tot'),
    coordinate: [0.00072, 40.10113],
    color: 0x748794,
    skin: 0xc79974,
    hair: 0x544334,
    lines: [
      line(
        'The engine is fine. The driver needs a little maintenance.',
        'El motor està bé. A qui li cal una revisió és al conductor.',
      ),
    ],
  },
  {
    id: 'borja',
    name: 'Borja',
    role: line('The snack connection', 'El contacte dels entrepans'),
    coordinate: [-0.00075, 40.10205],
    color: 0xe1bb77,
    skin: 0xd2a07a,
    hair: 0x3e3029,
    lines: [
      line(
        'A festival without sandwiches is just a meeting with loud music.',
        'Una festa sense entrepans és només una reunió amb música forta.',
      ),
    ],
  },
  {
    id: 'irene',
    name: 'Irene',
    role: line('Knows everyone’s business', 'Ho sap tot de tothom'),
    coordinate: [-0.00182, 40.10244],
    color: 0xb4a3c1,
    skin: 0xd4a081,
    hair: 0x72513c,
    lines: [
      line(
        'Marcos told me it would be a quiet night. That is usually the first warning.',
        'Marcos m’ha dit que seria una nit tranquil·la. Això sol ser el primer avís.',
      ),
    ],
  },
  {
    id: 'edu',
    name: 'Edu',
    role: line('The tape collector', 'El col·leccionista de cintes'),
    coordinate: [0.00058, 40.10031],
    color: 0x6d8f86,
    skin: 0xcfa27e,
    hair: 0x333033,
    lines: [
      line(
        'I dropped eight tapes around town. If you find one, it is yours. I made copies.',
        'He perdut huit cintes pel poble. Si en trobes una, te la pots quedar. En tinc còpies.',
      ),
    ],
  },
  {
    id: 'paul',
    name: 'Paul',
    role: line('Here for the long weekend', 'Ha vingut a passar el pont'),
    coordinate: [0.00197, 40.10415],
    color: 0xb28b69,
    skin: 0xdfb293,
    hair: 0xa28958,
    lines: [
      line(
        'I came for a weekend. That was three summers ago.',
        'Vaig vindre a passar un cap de setmana. D’això ja fa tres estius.',
      ),
    ],
  },
  {
    id: 'marina',
    name: 'Marina',
    role: line('Making tonight happen', 'La que ho fa possible'),
    coordinate: [-0.0007, 40.10047],
    color: 0xc5a059,
    skin: 0xc18a69,
    hair: 0x42352d,
    lines: [
      line(
        'A stage, a few lights, and people who turn up. That is all a town really needs.',
        'Un escenari, quatre llums i gent que hi vinga. Un poble no necessita gaire més.',
      ),
    ],
  },
  {
    id: 'aina',
    name: 'Aina',
    role: line('The last word', 'L’última paraula'),
    coordinate: [-0.00277, 40.10231],
    color: 0x9c6f76,
    skin: 0xd3a283,
    hair: 0x463733,
    lines: [
      line(
        'If anybody asks, tonight was my idea. If it goes wrong, it was Marcos’s.',
        'Si algú pregunta, la idea d’aquesta nit ha sigut meua. Si va malament, era de Marcos.',
      ),
    ],
  },
];
export const missionDialogues: Localized[][] = [
  [
    line(
      'Look who’s back. Same streets, same faces… and one very small problem.',
      'Mira qui ha tornat. Els mateixos carrers, les mateixes cares… i un problemet.',
    ),
    line(
      'Tonight’s festival has a stage, but no music. Castor knows where Laila’s tape ended up. Find him on Carrer d’Enmig.',
      'La festa d’aquesta nit té escenari, però no té música. Castor sap on ha anat a parar la cinta de Laila. Busca’l al carrer d’Enmig.',
    ),
    line(
      'Take a car if you like. Just bring yourself back in one piece. We’ve got a night to save.',
      'Agafa un cotxe si vols. Però torna sencer. Tenim una nit per salvar.',
    ),
  ],
  [
    line(
      'Marcos sent you? Of course he did. His plans always involve somebody else doing the driving.',
      'T’envia Marcos? És clar. Els seus plans sempre impliquen que conduïsca un altre.',
    ),
    line(
      'Laila is on Carrer de Baix la Vila with the master tape. Take it to Marina near Casa de la Cultura.',
      'Laila és al carrer de Baix la Vila amb la cinta mestra. Porta-la a Marina, prop de la Casa de la Cultura.',
    ),
    line(
      'Borrow any of our parked cars. F gets you in. The handbrake is Space. Try to keep all four wheels attached.',
      'Pots agafar qualsevol dels nostres cotxes aparcats. Puja-hi amb F. El fre de mà és la barra espaiadora. Intenta conservar les quatre rodes.',
    ),
  ],
  [
    line(
      'Careful with this. Two sides, ninety minutes, and absolutely no filler.',
      'Ves amb compte amb açò. Dues cares, noranta minuts i cap cançó de farciment.',
    ),
    line(
      'Marina is waiting near Casa de la Cultura. Tell her the last track is for everyone who stayed.',
      'Marina t’espera prop de la Casa de la Cultura. Digues-li que l’última cançó és per a tots els que s’han quedat.',
    ),
  ],
  [
    line(
      'The tape! I was about to ask Piopol to sing. You have saved us all.',
      'La cinta! Estava a punt de demanar a Piopol que cantara. Ens has salvat a tots.',
    ),
    line(
      'I’ll get the speakers going. Go tell Marcos we’re ready. And take this for the petrol.',
      'Vaig a posar els altaveus en marxa. Ves a dir a Marcos que ja ho tenim tot. I agafa açò per a la gasolina.',
    ),
  ],
  [
    line(
      'Hear that? That’s our town. You actually pulled it off.',
      'Ho sents? És el nostre poble. Ho has aconseguit.',
    ),
    line(
      'Stay a while. Talk to the others. Find Edu’s lost tapes. Tonight, there’s nowhere else we need to be.',
      'Queda’t una estona. Parla amb la colla. Troba les cintes que ha perdut Edu. Aquesta nit, no ens cal ser enlloc més.',
    ),
  ],
];
export const missionContacts = ['marcos', 'castor', 'laila', 'marina', 'marcos'] as const;
