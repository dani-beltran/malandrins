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
    id: 'lucas',
    name: 'Lucas',
    role: line('Always ready for a drive', 'Sempre a punt per a una volta'),
    coordinate: [-0.00277, 40.10231],
    color: 0x637eaa,
    skin: 0xd3a283,
    hair: 0x463733,
    lines: [
      line(
        'I only went out for a short drive. Three laps of the town later, I still haven’t picked a destination.',
        'Només havia eixit a fer una volteta. Després de tres voltes al poble, encara no he decidit on anar.',
      ),
    ],
  },
  {
    id: 'dorin',
    name: 'Dorin',
    role: line('The patient problem-solver', 'El que ho resol amb paciència'),
    coordinate: [-0.0012, 40.10118],
    color: 0x927957,
    skin: 0xc79673,
    hair: 0x382f2c,
    lines: [
      line(
        'Give me five minutes and a bit of wire. If it still doesn’t work, give Mihai a shout.',
        'Dona’m cinc minuts i un tros de fil d’aram. Si encara no funciona, crida Mihai.',
      ),
    ],
  },
  {
    id: 'susana',
    name: 'Susana',
    role: line('Keeps the festival on schedule', 'Controla els horaris de la festa'),
    coordinate: [-0.00028, 40.1022],
    color: 0xad627a,
    skin: 0xd0a17c,
    hair: 0x553a30,
    lines: [
      line(
        'I told everyone the music starts at nine. I told Vilero eight. We might all arrive together for once.',
        'He dit a tots que la música comença a les nou. A Vilero li he dit a les huit. Potser per una vegada arribarem tots junts.',
      ),
    ],
  },
  {
    id: 'daniel',
    name: 'Daniel',
    role: line('Full of bright ideas', 'Sempre amb idees noves'),
    coordinate: [-0.0024, 40.1038],
    color: 0x538b91,
    skin: 0xc59470,
    hair: 0x302b28,
    lines: [
      line(
        'We should put the whole town in a video game. Keep the hills, but give the cars better brakes.',
        'Hauríem de posar tot el poble en un videojoc. Deixem les costeres, però posem millors frens als cotxes.',
      ),
    ],
  },
  {
    id: 'nando',
    name: 'Nando',
    role: line('First on the dance floor', 'El primer a eixir a ballar'),
    coordinate: [0.00058, 40.10257],
    color: 0xcc9853,
    skin: 0xbc8865,
    hair: 0x45342a,
    lines: [
      line(
        'I’m saving my energy for tonight. Sitting here doing nothing is part of the preparation.',
        'Guarde forces per a aquesta nit. Estar ací assegut sense fer res forma part de la preparació.',
      ),
    ],
  },
  {
    id: 'roberto',
    name: 'Roberto',
    role: line('Takes the scenic route', 'Sempre pel camí més bonic'),
    coordinate: [0.00145, 40.10062],
    color: 0x9a6856,
    skin: 0xc39473,
    hair: 0x605047,
    lines: [
      line(
        'The best route is the one with a good view and somewhere to stop for a sandwich.',
        'El millor camí és el que té bones vistes i un lloc on parar a menjar un entrepà.',
      ),
    ],
  },
  {
    id: 'el-alcalde',
    name: 'El Alcalde',
    role: line('A speech for every occasion', 'Un discurs per a cada ocasió'),
    coordinate: [-0.00084, 40.10145],
    color: 0x58657d,
    skin: 0xcf9c7a,
    hair: 0x89847a,
    lines: [
      line(
        'I’ve prepared a very short speech for the festival. Marina says I have until the first song starts.',
        'He preparat un discurs molt curt per a la festa. Marina diu que tinc fins que comence la primera cançó.',
      ),
    ],
  },
  {
    id: 'merxe',
    name: 'Merxe',
    role: line('Never forgets a face', 'No oblida mai una cara'),
    coordinate: [-0.00174, 40.10082],
    color: 0x9783ae,
    skin: 0xd2a487,
    hair: 0x674535,
    lines: [
      line(
        'You’ve grown since I last saw you. Or I’ve been sitting in this chair too long. Come and tell me your news.',
        'Has crescut des de l’última vegada que et vaig vore. O porte massa temps en aquesta cadira. Vine i conta’m com et va.',
      ),
    ],
  },
  {
    id: 'juanito',
    name: 'Juanito',
    role: line('Champion of the afternoon break', 'Campió del descans de la vesprada'),
    coordinate: [-0.00088, 40.10355],
    color: 0x859a58,
    skin: 0xba8665,
    hair: 0x4c4237,
    lines: [
      line(
        'Someone has to test these benches. I take my responsibilities very seriously.',
        'Algú ha de provar aquests bancs. Em prenc les meues responsabilitats molt seriosament.',
      ),
    ],
  },
  {
    id: 'eva',
    name: 'Eva',
    role: line('Captures the good moments', 'Captura els bons moments'),
    coordinate: [0.00126, 40.10343],
    color: 0xbf795f,
    skin: 0xd4a585,
    hair: 0x44312e,
    lines: [
      line(
        'I’ve got two photos left on this roll. One for the festival, and one for whatever Castor does next.',
        'Em queden dues fotos al rodet. Una per a la festa i una altra per a la pròxima ocurrència de Castor.',
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
