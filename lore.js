// Zu jeder Karte: eine kleine Geschichte aus der Welt von Runenfurt (STORY) und eine genaue Erklärung, was sie
// im Kampf tut (explain). Die Erklärung wird aus den Kartenwerten erzeugt und stimmt deshalb immer mit dem Spiel überein.
import { CARDS, UNITS, RUNES, RUNE_LEVEL, TOWER_SPELL_FACTOR, UNIT_NAMES } from './cards.js';
import { cardMult, towerMult } from './sim.js';

export const STORY = {
  raufbold: 'Früher Türsteher im Gasthaus „Zur nassen Furt“, heute der Erste, der über die Brücke rennt. Das Stirnband hat ihm seine Mutter gestrickt – wer darüber lacht, lernt seine Fäuste kennen.',
  waldlaeufer: 'Zwei Geschwister aus dem Moosgrund, die seit Kindertagen um die Wette schießen. Wer zuerst trifft, muss abends nicht abwaschen.',
  steinhueter: 'Ein Stück Flussufer, das eines Morgens aufstand und losging. Seit hundert Jahren sucht er den Turm, aus dem man ihn einst gebrochen hat – und prüft jeden sehr gründlich.',
  wurzelwichte: 'Sie wohnen unter den Wurzeln der alten Weiden und halten alles, was über ihnen trampelt, für eine Einladung zum Beißen.',
  sturmkraehen: 'Die Krähen der Sturmhöhe tragen Halsbänder in den Farben dessen, der sie zuletzt gefüttert hat. Treue ist bei ihnen eine Frage des Frühstücks.',
  nebelrochen: 'Bei Nebel steigen die Rochen aus dem Fluss und gleiten durch die Luft, als wäre sie Wasser. Niemand hat ihnen je gesagt, dass das nicht geht.',
  funkenweberin: 'Eigentlich wollte sie nur Laternen anzünden. Seit dem Brand in der Weberei hält man Abstand – und stellt sie lieber auf die eigene Seite.',
  torknacker: 'Er hat sich nie gemerkt, wo die Tür ist, und irgendwann aufgehört, danach zu suchen. Der Balken stammt aus dem letzten Tor, das ihm im Weg stand.',
  eisenwaechter: 'Die Wächter der Eisenklamm schwören, die Furt nie zu verlassen. Den Schild geben sie nur zum Schlafen aus der Hand – manche nicht einmal dann.',
  hammerschmied: 'Sein Hammer heißt „Feierabend“. Wer ihn zu spüren bekommt, hat welchen.',
  glutling: 'Ein Funke aus dem Glutkessel, der beschlossen hat, sich einmal richtig aufzuregen. Länger als einen Augenblick hält er das nie aus.',
  klingentaenzerin: 'Auf den Festen am Fluss tanzte sie mit Bändern. Dann tauschte jemand die Bänder gegen Klingen, und aus dem Tanz wurde Ernst.',
  bolzenschuetzin: 'Ihre Armbrust wiegt mehr als sie selbst. Sie nennt das „Standfestigkeit“ und trifft damit eine Krähe am anderen Ufer genau ins Halsband.',
  donnerkaefer: 'Die Käfer der Donnerschlucht sammeln Steine, wie andere Blüten sammeln. Was sie nicht mehr tragen können, lassen sie fallen – am liebsten über Türmen.',
  frostschamane: 'Er stieg von den Frostzinnen herab, um den Fluss zu bitten, im Winter stillzustehen. Der Fluss lehnte ab; seitdem übt er an allem anderen.',
  kieselbande: 'Jeder Kiesel im Flussbett träumt davon, ein Berg zu sein. Zehn von ihnen haben beschlossen, wenigstens einen zu fressen.',
  erzritter: 'In der Rüstung stecke seit Jahren niemand mehr, sagen die einen. Die anderen sagen lieber nichts, weil er gerade vorbeigeht.',
  wurzelmutter: 'Die Wichte nennen sie Mutter, obwohl sie nur ein einziges Mal „Raus aus meinem Garten!“ gerufen hat. Sie kamen. Sie blieben.',
  hornbulle: 'Der Bulle vom Aschenfeld erträgt keine Türme am Horizont. Er nimmt Anlauf, um die Sache ein für alle Mal zu klären.',
  eisenmarschall: 'Marschall Garmund hat die Furt dreimal gehalten und zweimal zurückerobert. Wenn er ruft, laufen selbst die Wichte in Reih und Glied.',
  sturmrufer: 'Auf der Sturmhöhe lernte er, die Blitze beim Namen zu rufen. Sie kommen nicht immer gern, aber sie kommen.',
  sternschlag: 'Die Sternwarte behauptet, jeder Stern falle genau dorthin, wo man ihn braucht. Die Sternwarte steht deshalb möglichst weit weg vom Schlachtfeld.',
  hagelschauer: 'Wetter aus den Frostzinnen, in Fässern gelagert und bei Bedarf über dem Gegner geöffnet. Haltbar bis zum nächsten Frühling.',
  wurzelgriff: 'Die Weiden an der Furt mögen es nicht, wenn man rennt. Ein leises Wort genügt, und sie halten jeden fest, der es eilig hat.',
  heilquell: 'Wasser aus der Quelle unter dem Runenthron. Es schmeckt nach Minze und nach zweiter Chance.',
  funkenschlag: 'Ein Blitz im Kleinformat: reicht nicht zum Angeben, aber genau zum Stören.',
  sumpfdunst: 'Im Schattenmoor füllt man den Abendnebel in Krüge. Wer den Deckel hebt, sollte auf der richtigen Seite stehen.',
  kriegstrommel: 'Drei Schläge, und selbst der müdeste Wicht findet, dass heute ein guter Tag zum Stürmen ist.',
  ballistenturm: 'Aus dem Holz eines gesunkenen Fährboots gebaut. Die Fähre fährt nicht mehr, aber die Bolzen kommen noch pünktlich an.',
  steinschleuder: 'Die einfachste Maschine der Furt: ein Balken, ein Stein und jemand mit schlechter Laune.',
  erdloch: 'Niemand hat es gegraben. Es war eines Tages da, und seitdem kommt alle paar Augenblicke etwas Bissiges heraus.',
  dornwerfer: 'Waldgeister, die mit Dornen werfen, seit ihnen jemand die Kirschkerne weggenommen hat. Der Jemand wird noch gesucht.',
  nachtfalter: 'Sie fliegen zum Licht – und halten leider auch die Kristalle auf den Türmen für Licht.',
  kraehenschwarm: 'Wenn auf der Sturmhöhe das Futter knapp wird, kommen alle auf einmal. Der Himmel wird dann kurz sehr dunkel und sehr laut.',
  schildknappen: 'Drei Knappen der Eisenwächter, die ihre Schilde eigentlich noch gar nicht tragen dürften. Als Deckung reicht es trotzdem.',
  brockenwerfer: 'Ein Flusstroll, dem das Steineflitschen zu klein wurde. Er wirft jetzt nur noch auf Dinge, die nicht wegspringen können.',
  gewitterkarren: 'Die Tüftler der Donnerschlucht haben ein Gewitter in ein Kupferfass gesperrt. Man hört es knistern, lange bevor man weiß, warum.',
  kegler: 'Im Winter kegeln die Trolle auf dem zugefrorenen Fluss. Im Sommer fehlt ihnen das Eis, also nehmen sie die Brücke.',
  sternschuetzin: 'Ihre Pfeile sind aus Sternenlicht gezogen und halten an nichts an – nicht an Schilden, nicht an Rüstungen, nicht an guten Vorsätzen.',
  wuehler: 'Ein Maulwurf mit Bergmannshelm und schlechtem Orientierungssinn. Dass er meist am gegnerischen Turm herauskommt, nennt er Absicht.',
  blitzfaenger: 'Er sammelt Blitze in Gläsern und lässt sie paarweise wieder frei. Seine Augenbrauen wachsen seit Jahren nicht mehr nach.',
  trommelschlaeger: 'Er rennt, er schlägt, er trommelt – und wenn er fällt, trommelt es einfach weiter.',
  eisbrocken: 'Ein Stück Gletscher mit Heimweh. Er läuft zum nächsten Gebäude, weil er es für einen Berg hält.',
  panzerbaer: 'Die Schmiede der Eisenklamm fanden ihn schlafend und bauten die Rüstung um ihn herum. Geweckt hat ihn erst der Kriegslärm – seine Laune ist entsprechend.',
  basaltriese: 'Als der Glutkessel erkaltete, blieb er einfach stehen. In ihm glimmt noch genug, um zwei Kleinere zu wecken, wenn er zerbricht.',
  weitschuetzin: 'Sie hat nie verstanden, warum man zum Kämpfen hingehen muss. Von ihrem Hügel aus sieht sie die Türme doch.',
  blasrohrwicht: 'Der einzige Wicht, der lieber pustet als beißt. Die anderen halten ihn für eingebildet, er hält Abstand.',
  panzerhornisse: 'Eine Hornisse, so groß wie ein Fass, mit einer Geduld, so kurz wie ihr Stachel lang ist.',
  laternenfisch: 'Er stammt aus der Tiefe der Kristallgrotte. Sein Licht lockt erst an – und wird dann sehr, sehr warm.',
  nebelschleicher: 'Man sagt, er sei ein Wächter, den man vergessen hat abzulösen. Zu sehen ist er erst, wenn seine Klinge schon unterwegs ist.',
  zuendler: 'Er hat den Glutofen gebaut und darf ihn seither nicht mehr betreten. Also nimmt er das Feuer in Töpfen mit.',
  sprengkaefer: 'Zwei Käfer, ein Fass und keinerlei Plan für danach.',
  feldheilerin: 'Sie flickt, was der Kampf zerreißt – und haut zu, wenn jemand über ihre Verbände trampelt.',
  fasstraeger: 'Er sollte das Pulverfass nur zur Brücke bringen. Niemand hat ihm gesagt, dass er es dort abstellen darf.',
  schattenjaegerin: 'Ihren Namen kennt niemand; im Schattenmoor heißt sie nur „die, die schon da war“. Wer ihren Schleier sieht, sieht für eine Weile nichts anderes mehr.',
  wurzelkoenig: 'Der älteste Baum des Moosgrunds, der eines Tages genug vom Herumstehen hatte. Sein Volk wächst ihm buchstäblich hinterher.',
  windlaeufer: 'Er überquerte als Erster die Himmelsbrücke – in beide Richtungen, am selben Morgen. Seitdem geht er nirgends mehr langsam hin.',
  frostnacht: 'Die längste Nacht der Frostzinnen, in einer Schneekugel eingefangen. Schütteln nicht nötig.',
  donnerkeil: 'Die Donnerschlucht schuldet der Furt noch drei Blitze. Sie werden stets bei den Größten eingelöst.',
  felssturz: 'Ein Stück der Eisenklamm mit einer sehr eigenen Meinung zur Schwerkraft.',
  wichtwurf: 'Die Wichte bestehen darauf, freiwillig in den Sack gestiegen zu sein. Den Rest nennen sie „Reisen“.',
  rollstein: 'Die Steinmetze der Kieselfurt rollen ihn sonst zum Mahlen. Auf der Brücke mahlt er feiner.',
  wirbelwind: 'Ein Rest Sturm von der Sturmhöhe, der sich noch einmal alles genau ansehen will – am liebsten alles gleichzeitig.',
  sonnenspiegel: 'Die Sternwarte hat ihn für die Nacht gebaut, die Furt nutzt ihn am Tag. Was er lange ansieht, wird nie wieder kalt.',
  kesselturm: 'Das Pech im Kessel ist seit dem letzten Krieg nicht ausgegangen. Niemand weiß, wer nachfüllt.',
  fernschleuder: 'Gebaut, um Äpfel über den Fluss zu werfen. Der erste Stein war ein Versehen, der zweite nicht mehr.',
  glutofen: 'In diesem Ofen backt niemand Brot. Was herauskommt, ist trotzdem ofenfrisch – und sehr schlecht gelaunt.',
  kraftquell: 'Wo einst ein Runenstein in den Fluss fiel, sprudelt die Kraft von selbst. Man muss den Brunnen nur stehen lassen – das ist der schwierige Teil.',
  // --- Zweite Erweiterung ---
  kieseltrio: 'Drei Kiesel, die bei der großen Bande nicht mitdurften, weil sie beim Abzählen immer übrig blieben. Seitdem beißen sie auf eigene Rechnung.',
  flussraeuber: 'Sie nennen es „Fährdienst“: Wer über die Furt will, zahlt. Wer nicht zahlt, lernt, wozu ein Ruder sonst noch gut ist.',
  sturmbrueder: 'Zwillinge aus der Eisenklamm, die noch nie in ihrem Leben gegangen sind – nur gerannt. Ihre Mutter hat die Türen daheim vorsorglich ausgehängt.',
  flugsamen: 'Im Frühjahr lassen die Kiesel sich von den großen Pusteblumen des Nebelhains tragen. Wohin der Wind sie weht, ist ihnen gleich, solange unten jemand zum Beißen steht.',
  wurzelrotte: 'Wurzelwichte und Dornwerfer vertragen sich eigentlich nicht. Nur wenn es etwas zu holen gibt, ziehen sie gemeinsam los – und streiten erst hinterher um die Beute.',
  frostling: 'Ein Splitter Gletschereis von den Frostzinnen, der sich einsam fühlt. Er will nur jemanden umarmen. Dass danach alle starr dastehen, hält er für Rührung.',
  funkling: 'Entsteht, wenn in der Donnerschlucht ein Blitz danebengeht. Er ist nur einen Wimpernschlag auf der Welt und fest entschlossen, in der Zeit möglichst viele kennenzulernen.',
  tauling: 'Ein Tropfen Morgentau vom Heilquell, der laufen gelernt hat. Wo er zerplatzt, richten sich geknickte Halme wieder auf – und müde Kämpfer auch.',
  grenzwache: 'Sechs Wachen vom alten Grenzwall. Ihr Befehl lautet „Linie halten“, und den nehmen sie so wörtlich, dass sie sogar beim Mittagessen nebeneinander sitzen.',
  muehlenbande: 'Der Müllerbursche trägt die Säcke, die beiden Lehrmädchen werfen mit allem, was in der Mühle nicht festgenagelt ist. Der Müller sucht seit Wochen seine Gewichte.',
  knallfrosch: 'Frisst für sein Leben gern Knallschoten vom Glutkessel. Was er nicht verdaut, spuckt er wieder aus – mit einem Rückstoß, der ihn jedes Mal selbst überrascht.',
  rochenbrut: 'Zwei Jungrochen aus demselben Gelege. Sie üben das Nebelspucken noch und treffen meistens nur ungefähr – aber ungefähr reicht, wenn die Kugel platzt.',
  wueterich: 'Niemand weiß mehr, worüber er sich einst so aufgeregt hat, er selbst am wenigsten. Aufgehört hat er jedenfalls nicht.',
  pulverwicht: 'Der einzige Wicht, der lesen kann – leider nur das Wort „Vorsicht“, und das hält er für seinen Namen. Wird es eng, zündet er die Lunte und rennt dorthin, wo es am meisten kracht.',
  stammlaeufer: 'Zwei Flussräuber, die fanden, dass Anklopfen zu lange dauert. Den Stamm haben sie sich von der Fähre geliehen; die Fähre weiß noch nichts davon.',
  schuetzenbund: 'Drei Bolzenschützinnen, die geschworen haben, nie getrennt auszurücken. Wer eine von ihnen anheuert, bekommt die Rechnung für alle drei.',
  segelwicht: 'Er wollte fliegen wie die Krähen und hat sich das größte Blatt der Weide ausgesucht. Lenken kann er es nicht. Werfen dafür sehr gut.',
  keilerrotte: 'Die Keiler vom Schattenmoor halten den Fluss für eine Pfütze und Brücken für Zeitverschwendung. Vor Türmen haben sie keinen Respekt, vor Zäunen noch weniger.',
  zitterlinge: 'Funkenpilze wachsen dort, wo der Blitz in feuchtes Holz geschlagen hat. Wer sie pflücken will, tut das genau einmal.',
  kraftkloss: 'Ein Klumpen geronnener Kraft aus einem übergelaufenen Kraftquell. Stark ist er, aber wer ihn zerschlägt, darf die Stücke behalten – das hat sich leider herumgesprochen.',
  distelritter: 'Er hat der Distel Treue geschworen, weil sie die einzige Blume ist, die zurücksticht. Seinen Schild hat noch niemand zweimal berührt.',
  sichelwerfer: 'Früher Schnitter auf den Feldern am Aschenfeld. Seine Sichel kam immer zu ihm zurück, also fing er an, sie zu werfen. Die Ernte ist seitdem eine andere.',
  armbrustwagen: 'Ein Wicht, ein Karren, eine gestohlene Armbrust. Die Achse hält nie lange, aber er hat gelernt, dass man auch im Stehen schießen kann.',
  gewitterrochen: 'Er schläft in den Wolken über der Donnerschlucht und lädt sich dabei auf. Geweckt wird er nicht gern – und seine schlechte Laune teilt er gleich mit dreien.',
  splitterjaeger: 'Er jagt mit einer Handvoll Kiessplitter statt mit Pfeilen. Auf hundert Schritt trifft er die Scheune, auf drei Schritt alles, was in der Scheune ist.',
  astriese: 'Ein alter Weidenstumpf, der es leid war, dass Dornwerfer in seinen Ästen nisten. Loswerden konnte er sie nicht, also nimmt er sie eben mit.',
  dornenkoloss: 'Ein Fels, den die Brombeeren der Kristallgrotte ganz überwuchert haben. Er tut niemandem etwas zuleide. Wer ihn anfasst, ist selbst schuld.',
  aschenschwinge: 'Sie steigt aus dem Krater des Aschenfelds, schwer wie ein Gewitter. Stirbt sie, zerfällt sie in Funken – und jeder Funke erinnert sich, wohin sie wollte.',
  wegelagerin: 'Sie wartet am Weg, bis jemand weit genug weg steht, um sich sicher zu fühlen. Den Rest sieht man nicht – nur das Ergebnis.',
  falterhueterin: 'Sie hütet die Nachtfalter des Schattenmoors und trägt ihnen die Laterne voraus. Wer ihr Licht ausbläst, hat den ganzen Schwarm im Gesicht.',
  rankenreiterin: 'Ihren Hirschkäfer hat sie als Larve gefunden und mit Honig großgezogen. Er rennt jede Wand ein; sie sorgt mit ihren Ranken dafür, dass ihm niemand dabei im Weg steht.',
  seilwerfer: 'Fährmann ohne Fähre, seit die Flussräuber sie „geliehen“ haben. Mit Seil und Haken holt er sich jetzt alles heran, was er braucht – auch Leute, die das gar nicht wollen.',
  fluchweberin: 'Sie spinnt Flüche wie andere Wolle. Wer ihren Faden am Leib trägt und fällt, steht als Irrwisch wieder auf und weiß nur noch eines: wem er jetzt gehört.',
  glutfalke: 'Er nistet im Glutofen und verbrennt, wenn man ihn schlägt. Sein Ei aber ist schon fast ausgebrütet – wer es liegen lässt, sieht ihn wieder.',
  stelzenkessel: 'Ein Wicht hat dem Kesselturm den Kessel gestohlen und ihm Beine gemacht. Was er darin kocht, will niemand wissen. Was er daraus schleudert, erfährt man schnell genug.',
  runenhuene: 'Einer der Steine vom Runenthron, die laufen können. Er ritzt denen, die neben ihm gehen, sein Zeichen in die Waffen – wer es trägt, schlägt für zwei.',
  wanderbusch: 'Ein ganz gewöhnlicher Busch. Wirklich. Büsche wandern eben manchmal. Dass es darin kichert, bildest du dir ein.',
  stollenmeister: 'Er hat unter der halben Arena Gänge gegraben und kennt jeden davon. Sein Bohrer läuft sich warm, je länger er arbeitet – und er hasst es, unterbrochen zu werden.',
  flussmoench: 'Er hat dreißig Jahre am Ufer gesessen und dem Wasser zugesehen. Jetzt schlägt er zu wie der Fluss: zweimal sanft, einmal so, dass es Steine versetzt.',
  jungfuerst: 'Zu jung für den Thron, zu ungeduldig für den Unterricht. Schießen kann er. Und wenn es brenzlig wird, kann er sehr laut nach seiner Leibwächterin rufen.',
  hohlstamm: 'Die Flussräuber verstecken sich gern in hohlen Stämmen. Dass man Stämme auch rollen kann, haben sie herausgefunden, als einer am Hang einschlief.',
  trugbild: 'Ein Zauber aus Flussnebel und Spiegellicht. Die Abbilder wissen nicht, dass sie keine echten Kämpfer sind – und schlagen genauso überzeugt zu.',
  bodengrollen: 'Tief unter Runenfurt dreht sich etwas im Schlaf um. Oben fallen dann die Mauern – die Vögel merken nichts davon.',
  eiswurf: 'Ein Brocken von den Frostzinnen, im Sommer geworfen, damit er auch wirklich überrascht. Er tut weniger weh, als er aussieht, aber er schiebt.',
  wurzelfluch: 'Ein altes Wort der Wurzelwichte. Wer es hört, wird dünnhäutig – und wer darüber fällt, dem wachsen Hörner und ein sehr schlechtes Benehmen.',
  geroellfeld: 'Unter jedem Acker liegen Kiesel und warten. Dieser Zauber sagt ihnen nur, dass es jetzt so weit ist.',
  widerhall: 'In der Kristallgrotte kommt jeder Ruf lauter zurück, als er hineinging. Dieser Zauber macht dasselbe mit dem, was du zuletzt getan hast.',
  wachkiste: 'Nachschub vom Grenzwall, abgeworfen von sehr weit oben. Die Wache darin ist den Aufprall gewohnt. Wer darunter steht, nicht.',
  sternenschlund: 'Ein Riss im Himmel über der Sternwarte. Er zieht an allem zugleich – steht nur einer davor, bekommt der den ganzen Zug ab.',
  raeuberlager: 'Wo die Flussräuber ihr Zelt aufschlagen, bleibt selten etwas stehen. Sie gehen in Schichten zur Arbeit und kommen nie mit leeren Händen zurück.',
  kieselhaufen: 'Sieht aus wie ein Haufen Steine am Wegrand. Ist ein Haufen Steine am Wegrand. Nur dass immer wieder einer davon aufsteht und geht.',
  wolfszwinger: 'Den Wolf hat niemand gezähmt, man hat ihn nur eingesperrt. Er merkt sich jeden, der am Gitter rüttelt.',
  maulwurfshuegel: 'Die Wurzelwichte haben sich mit den Maulwürfen geeinigt: Die einen graben, die anderen beißen. Der Hügel hält nicht lange, aber er taucht auf, wo niemand ihn bestellt hat.',
  funkenpfahl: 'Ein Pfahl mit einer Kupferspule aus der Donnerschlucht. Er liegt still unter der Erde, bis jemand darüberläuft – dann erinnert er sich an das Gewitter.',
  kurbelbogen: 'Vier Mann spannen ihn, einer zielt, und dann schießt er, bis die Bolzen ausgehen. Vom Flussufer aus reicht das bis ans Tor des Gegners.',
  wachturm: 'Seit es die Furt gibt, steht an jedem Ufer ein Wachturm. Die Kristalle auf ihren Zinnen haben noch jeden Sturm überdauert.',
  geschuetzturm: 'Die Eisenklamm lieferte den Mörser, die Kieselfurt die Kugeln. Er schießt selten – aber man hört es bis zur Sternwarte.',
  klingenturm: 'Die Klingentänzerinnen der Sturmhöhe schenkten der Furt ihre alten Übungsklingen. Der Turm wirft sie zurück – allerdings dem Gegner.',
  segensturm: 'Auf seinem Altar brennt ein Licht vom Runenthron. Wen es berührt, der kämpft, als hätte er einen Rang mehr.',
};

const n = v => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const d = v => String(Math.round(v * 100) / 100).replace('.', ',');
const NAME = UNIT_NAMES;
const some = (unit, k) => `${k === 1 ? (/[ei]n$|e$/.test(NAME[unit][0]) ? 'eine' : 'ein') : k} ${NAME[unit][k > 1 ? 1 : 0]}`; // „ein Kiesel“, „2 Flussräuber“, „eine Speerwache“
const F = v => (v === 1 ? '1 Feld' : `${d(v)} Feldern`); // „im Umkreis von 1 Feld“
const TEMPO = v => (v <= 0.8 ? 'langsam' : v <= 1.1 ? 'mittelschnell' : v <= 1.6 ? 'schnell' : 'sehr schnell');

// Was die Karte auf Stufe lvl genau tut – als Liste kurzer Sätze.
export function explain(id, lvl = 1) {
  const c = CARDS[id], out = [];
  if (c.type === 'tower') {
    const u = UNITS[c.unit], m = towerMult(lvl);
    out.push('Die Turmkarte bestimmt die Art deiner beiden Außentürme. Ihre Stufe gilt für beide; der Hauptturm in der Mitte hat stattdessen deine Spielerstufe.');
    out.push(`Jeder Außenturm hat ${n(u.hp * m)} Leben und schießt alle ${d(u.atk)} s für ${n(u.dmg * m)} Schaden auf das nächste Ziel im Umkreis von ${d(u.range)} Feldern – am Boden und in der Luft.`);
    out.push('Wer noch auf der Brücke steht, ist außer Reichweite; erst ein Stück dahinter beginnt der Turm zu schießen.');
    if (u.ammo) out.push(`Er hält ${u.ammo.max} Klingen vorrätig und wirft sie in diesem Takt. Ohne Ziel kommt alle ${d(u.ammo.reload)} s eine Klinge nach; ist der Vorrat im Gefecht leer, wirft er nur noch alle ${d(u.ammo.reload + u.atk)} s.`);
    if (u.bless) out.push(`Segen: Etwa alle ${u.bless.every} Sekunden (im Gefecht und nach dem Verlust eines Turms langsamer, bis zu 38 s) steigt deine zäheste Truppe auf dem Feld um eine Stufe – 10 % mehr Leben und Schaden. Jede Truppe nur einmal; wer weniger als ein Drittel Leben hat, wird übergangen. Sind beide Außentürme gefallen, endet der Segen.`);
    if (id === 'geschuetzturm') out.push('Ein einzelner Schuss fällt schwache Schützen sofort, aber zwischen zwei Schüssen kommen Schwärme weit voran.');
    out.push('Mit jeder Stufe wachsen Leben und Schaden um 8 %.');
    return out;
  }
  const m = cardMult(lvl);
  if (c.type === 'spell') {
    if (c.mirror) {
      out.push('Zauber ohne eigene Wirkung: Er spielt die Karte, die du zuletzt gespielt hast, noch einmal – für eine Kraft mehr, als sie kostet.');
      out.push(`Die wiederholte Karte erscheint auf Stufe ${lvl + 1}: immer eine Stufe über dem Widerhall selbst – gleich, welche Stufe sie in deinem Deck hat. Wer den Widerhall aufwertet, macht also jede wiederholte Karte stärker.`);
      out.push('Aufgestellt wird nach den Regeln der wiederholten Karte: Truppen auf deiner Seite, Zauber überall.');
      out.push('Solange du in diesem Kampf noch nichts gespielt hast, lässt er sich nicht ausspielen. Helden wiederholt er nicht – er merkt sich dann die Karte davor.');
      return out;
    }
    out.push(`Zauber für ${c.cost} Kraft. ${c.ownSide ? 'Er lässt sich nur auf deiner eigenen Seite wirken' : 'Er lässt sich überall auf dem Feld wirken'} und trifft ${d(c.delay)} s nach dem Ausspielen.`);
    if (c.roll && c.rollSpawn) out.push(`Ein hohler Stamm rollt vom gewählten Punkt ${d(c.roll.len)} Felder geradeaus in Richtung Gegner. Auf seiner ${d(c.roll.w)} Felder breiten Bahn trifft er jede Bodentruppe und jedes Gebäude einmal für ${n(c.dmg * m)} Schaden (Türme: ${n(c.dmg * m * TOWER_SPELL_FACTOR)}). Flieger berührt er nicht.`);
    else if (c.roll) out.push(`Eine Walze rollt vom gewählten Punkt ${d(c.roll.len)} Felder geradeaus in Richtung Gegner. Auf ihrer ${d(c.roll.w)} Felder breiten Bahn trifft sie jede Bodentruppe und jedes Gebäude einmal für ${n(c.dmg * m)} Schaden (Türme: ${n(c.dmg * m * TOWER_SPELL_FACTOR)}). Flieger rollt sie nicht um.`);
    else if (c.strikes) out.push(`${c.strikes} Blitze treffen im Umkreis von ${d(c.radius)} Feldern die ${c.strikes} Gegner mit dem meisten Leben, je ${n(c.dmg * m)} Schaden (Türme: ${n(c.dmg * m * TOWER_SPELL_FACTOR)}). Kleinere Gegner daneben bleiben verschont.`);
    else if (c.dmg) out.push(`${n(c.dmg * m)} Schaden an allem im Umkreis von ${d(c.radius)} Feldern – Boden und Luft. Türme nehmen nur ein Viertel (${n(c.dmg * m * TOWER_SPELL_FACTOR)}).`);
    if (c.rollSpawn) out.push(`Am Ende der Bahn klettert ${some(c.rollSpawn.unit, c.rollSpawn.count)} heraus (${n(UNITS[c.rollSpawn.unit].hp * m)} Leben, ${n(UNITS[c.rollSpawn.unit].dmg * m)} Schaden) und kämpft für dich weiter.`);
    if (c.slow && c.dmg) out.push(`Getroffene Truppen laufen und schlagen danach ${d(c.slow)} s lang 30 % langsamer.`);
    if (c.clone) out.push(`Jede deiner Truppen im Umkreis von ${d(c.radius)} Feldern bekommt ein Abbild: gleicher Schaden, gleiche Fähigkeiten, aber nur ein einziger Lebenspunkt und kein Schild – der erste Treffer löscht es aus. Helden und Gebäude werden nicht verdoppelt.`);
    if (c.amp) out.push(`${c.dur} s lang nehmen gegnerische Truppen und Gebäude im Umkreis von ${d(c.radius)} Feldern ${Math.round((c.amp - 1) * 100)} % mehr Schaden – aus jeder Quelle.`);
    if (c.curse) out.push(`Fällt eine gegnerische Truppe, während sie im Kreis steht, wächst an ihrer Stelle ein ${NAME[c.curse][0]} (${n(UNITS[c.curse].hp * m)} Leben, ${n(UNITS[c.curse].dmg * m)} Schaden), der für dich kämpft.`);
    if (c.summonOver) { const so = c.summonOver, su = UNITS[so.unit]; out.push(`Im Umkreis von ${d(c.radius)} Feldern wühlen sich nacheinander ${so.count} ${NAME[so.unit][1]} aus dem Boden (je ${n(su.hp * m)} Leben, ${n(su.dmg * m)} Schaden): der erste nach ${d(so.first)} s, danach alle ${d(so.every)} s einer. Der Kreis darf überall liegen – auch rund um einen gegnerischen Turm.`); }
    if (c.pulses) { const q = c.pulses; out.push(`${q.n} Stöße im Abstand von ${d(q.every)} s treffen alles im Umkreis von ${d(c.radius)} Feldern, am Boden und in der Luft. Steht nur ein Gegner im Kreis, trifft jeder Stoß mit ${n(q.dmg[0] * m)} Schaden; bei zwei bis vier Gegnern mit ${n(q.dmg[1] * m)}, ab fünf nur noch mit ${n(q.dmg[2] * m)}. Türme nehmen ein Viertel.`); }
    if (c.knock) out.push(`Leichte Truppen werden ${d(c.knock)} Felder zurückgestoßen; ihr Anlauf oder Angriff beginnt neu. Schwere Brocken bleiben stehen.`);
    if (c.stun) out.push(`Getroffene Truppen und Gebäude sind ${d(c.stun)} s betäubt: Angriffe brechen ab, Anläufe und Ladungen beginnen von vorn. Türme lassen sich so nicht betäuben.`);
    if (c.freeze) out.push(`Alles im Kreis – Truppen, Gebäude und auch Türme – ist ${d(c.freeze)} s lang eingefroren und tut nichts.`);
    if (c.root) out.push(`Bodentruppen im Kreis sind ${d(c.root)} s festgehalten: Sie kommen nicht vom Fleck, schlagen aber weiter zu, wenn etwas in Reichweite ist. Flieger entkommen.`);
    if (c.heal) out.push(`Im Umkreis von ${d(c.radius)} Feldern heilt die Quelle deine Truppen ${c.dur} s lang alle ${d(c.tick)} s um ${n(c.heal * m)} – zusammen bis zu ${n(c.heal * m * c.dur / c.tick)}. Gebäude und Türme heilt sie nicht.`);
    if (c.dot && c.ground) out.push(`${c.dur} s lang bebt der Boden im Umkreis von ${d(c.radius)} Feldern: jede Sekunde ${n(c.dot * m)} Schaden an Bodentruppen, ${n(c.dot * m * c.buildF)} an Gebäuden und ${n(c.dot * m * c.towerF)} an Türmen. Bodentruppen im Kreis sind dabei 30 % langsamer; Flieger bleiben unberührt.`);
    else if (c.dot) out.push(`${c.dur} s lang alle ${d(c.tick)} s ${n(c.dot * m)} Schaden an allem im Umkreis von ${d(c.radius)} Feldern, zusammen bis zu ${n(c.dot * m * c.dur / c.tick)}. Wer den Kreis verlässt, nimmt keinen weiteren Schaden.`);
    if (c.pull) out.push('Solange der Wind weht, zieht er alle gegnerischen Truppen im Kreis zur Mitte – leichte schnell, schwere langsam. So holst du Angreifer vom Turm weg oder schiebst sie für einen Flächentreffer zusammen.');
    if (c.haste) out.push(`Eigene Truppen im Umkreis von ${d(c.radius)} Feldern laufen und schlagen ${c.haste} s lang 30 % schneller. Gebäude und Türme nicht.`);
    if (c.summon && c.ownSide) out.push(`Danach steigt am Zielpunkt ${some(c.summon.unit, c.summon.count)} aus (${n(UNITS[c.summon.unit].hp * m)} Leben${UNITS[c.summon.unit].shield ? `, Schild ${n(UNITS[c.summon.unit].shield * m)}` : ''}, ${n(UNITS[c.summon.unit].dmg * m)} Schaden) und verteidigt mit.`);
    else if (c.summon) out.push(`Am Zielpunkt landen ${c.summon.count} ${NAME[c.summon.unit][1]} (je ${n(UNITS[c.summon.unit].hp * m)} Leben, ${n(UNITS[c.summon.unit].dmg * m)} Schaden) – auch auf der gegnerischen Seite, direkt am Turm.`);
    out.push('Mit jeder Kartenstufe wächst die Wirkung um 10 %.');
    return out;
  }
  const u = UNITS[c.unit], many = c.count > 1, build = c.type === 'building', Sie = build ? 'Es' : 'Sie', sie = build ? 'es' : 'sie';
  // Aufstellen
  const bounty = x => (x.bounty || 0) + (x.deathSpawn && UNITS[x.deathSpawn.unit].bounty ? x.deathSpawn.count * bounty(UNITS[x.deathSpawn.unit]) : 0);
  if (c.type === 'building') out.push(`Gebäude für ${c.cost} Kraft. Es steht fest an seinem Platz ${c.anywhere ? '– und lässt sich an jeder Stelle des Felds aufstellen, auch direkt neben einem gegnerischen Turm' : 'auf deiner Seite'}${u.life ? `, verliert von selbst Leben und fällt nach ${u.life} s zusammen` : ''}. Gegner, die nur Gebäude angreifen, laufen zuerst zu ihm.`);
  else if (c.mix) out.push(`Gemischter Trupp für ${c.cost} Kraft: ${c.mix.map(([x, k]) => `${k} ${NAME[x][k > 1 ? 1 : 0]}`).join(' vorn, dahinter ')}. Aufstellbar auf deiner Seite (und hinter einem gefallenen Außenturm des Gegners); nach einer Sekunde legen sie los.`);
  else out.push(`${many ? `${c.count} Einheiten` : 'Eine Einheit'} für ${c.cost} Kraft, ${c.anywhere ? 'aufstellbar an jeder Stelle des Felds – auch direkt am gegnerischen Turm' : 'aufstellbar auf deiner Seite (und hinter einem gefallenen Außenturm des Gegners)'}. Nach dem Aufstellen dauert es eine Sekunde, bis ${many ? 'sie loslegen' : 'sie loslegt'}.`);
  if (c.spread) out.push(`Sie stellen sich in einer Reihe über ${c.spread} Felder Breite auf – so stehen an beiden Brücken zugleich Wachen.`);
  if (c.mix) { // die Schützen der zweiten Reihe gleich hier, alles Weitere gilt für die Vorderen
    const [bu, bk] = c.mix[1], b = UNITS[bu];
    out.push(`Hinten: ${bk} ${NAME[bu][1]} mit je ${n(b.hp * m)} Leben, die alle ${d(b.atk)} s aus ${d(b.range)} Feldern für ${n(b.dmg * m)} Schaden schießen${b.hitsAir ? ' – auf Boden und Luft' : ''}.`);
    out.push(`Vorn: ${c.mix[0][1]} ${NAME[c.mix[0][0]][c.mix[0][1] > 1 ? 1 : 0]} mit ${c.mix[0][1] > 1 ? 'je ' : ''}${n(u.hp * m)} Leben, ${TEMPO(u.speed)} – für sie gilt alles Weitere.`);
  } else out.push(`${many ? 'Jede hat' : `${Sie} hat`} ${n(u.hp * m)} Leben${u.speed ? ` und ist ${TEMPO(u.speed)}` : ''}${u.air ? '. Sie fliegt: überquert den Fluss an jeder Stelle und ist für Nahkämpfer am Boden unerreichbar' : ''}.`);
  if (u.ford) out.push('Sie springt über den Fluss, wo sie gerade steht, und braucht keine Brücke.');
  if (u.burrow) out.push('Vergraben: Solange kein Gegner in Reichweite ist, liegt es unter der Erde – dann kann es weder angegriffen noch von Zaubern getroffen werden. Kommt ein Ziel in Reichweite, fährt es in gut einer halben Sekunde aus und bleibt verwundbar, bis eine Sekunde lang kein Ziel mehr da war.');
  if (u.shield) out.push(`Schild mit ${n(u.shield * m)} Punkten: Solange er hält, kommt kein Schaden durch. Auch der Treffer, der ihn bricht, verpufft ganz – ein Sternschlag zerstört also nur den Schild.`);
  // Ziele und Angriff
  if (!u.dmg) out.push(`${Sie} greift nicht selbst an.`);
  else {
    const where = u.targets === 'buildings' ? (u.air ? 'Sie fliegt' : 'Sie läuft') + ' geradewegs zum nächsten Gebäude oder Turm und beachtet Truppen nicht – Truppen können sie also nur aufhalten, nicht ablenken.' : `${Sie} greift das nächste Ziel im Umkreis von ${build ? d(u.range) : '5,5'} Feldern an${build ? '' : '; ist keins da, läuft sie zum nächsten Gebäude oder Turm'}.`;
    out.push(`${where} ${u.hitsAir ? `${Sie} trifft Boden und Luft.` : u.targets === 'buildings' ? '' : `An Flieger kommt ${sie} nicht heran.`}`.trim());
    if (u.ramp && u.rampMelee) out.push(`Je länger sie dasselbe Ziel bearbeitet, desto härter: alle ${d(u.atk)} s ${n(u.dmg * m)} Schaden, nach ${u.ramp[0][0]} s am selben Ziel ${n(u.dmg * m * u.ramp[0][1])} und nach ${u.ramp[1][0]} s ${n(u.dmg * m * u.ramp[1][1])}. Wechselt das Ziel oder wird sie betäubt, beginnt sie wieder von vorn.`);
    else if (u.ramp) out.push(`Brennstrahl aus ${d(u.range)} Feldern: alle ${d(u.atk)} s ${n(u.dmg * m)} Schaden, nach ${u.ramp[0][0]} s am selben Ziel ${n(u.dmg * m * u.ramp[0][1])} und nach ${u.ramp[1][0]} s ${n(u.dmg * m * u.ramp[1][1])}. Wechselt das Ziel oder wird ${sie} betäubt, beginnt der Strahl wieder kalt.`);
    else if (u.kamikaze && u.chain) out.push(`Am Ziel zerspringt sie in einen Funken: ${n(u.dmg * m)} Schaden am ersten Gegner, dann hüpft er auf den jeweils nächsten im Umkreis von ${d(u.chain.r)} Feldern weiter – bis zu ${u.chain.n} Ziele, am Boden und in der Luft. Danach ist sie weg.`);
    else if (u.kamikaze && !u.splash) out.push(`Am Ziel angekommen trifft sie es ein einziges Mal für ${n(u.dmg * m)} Schaden – danach ist sie weg.`);
    else if (u.kamikaze) out.push(`Am Ziel zerplatzt sie: ${n(u.dmg * m)} Schaden an allem im Umkreis von ${d(u.splash)} Feldern${u.hitsAir ? ', auch an Fliegern' : ''}. Danach ist sie weg.`);
    else if (u.chain) out.push(`Alle ${d(u.atk)} s ein Blitz aus ${d(u.range)} Feldern: ${n(u.dmg * m)} Schaden am Ziel, dann springt er auf bis zu ${u.chain.n - 1} weitere Gegner im Umkreis von ${d(u.chain.r)} Feldern über – jeder nimmt den vollen Schaden.`);
    else if (u.scatter) out.push(`Alle ${d(u.atk)} s feuert sie ${u.scatter.n} Splitter im Fächer, jeder mit ${n(u.dmg * m)} Schaden. Jeder Splitter trifft den vordersten Gegner in seiner Bahn: Aus nächster Nähe treffen alle ${u.scatter.n} dasselbe Ziel (${n(u.dmg * m * u.scatter.n)}), auf volle Reichweite von ${d(u.range)} Feldern meist nur zwei.`);
    else if (u.burst) out.push(`Alle ${d(u.atk)} s spuckt sie aus ${d(u.range)} Feldern eine Schote. Am Ziel zerspringt sie, und die Kerne fliegen ${d(u.burst.len)} Felder in Schussrichtung weiter: ${n(u.dmg * m)} Schaden an allem auf dieser ${d(u.burst.w)} Felder breiten Bahn – auch an dem, was hinter dem Ziel steht.`);
    else if (u.line) out.push(`Alle ${d(u.atk)} s ein Geschoss aus bis zu ${d(u.range)} Feldern: Es fliegt ${d(u.line.len)} Felder geradeaus weiter und trifft auf seiner ${d(u.line.w)} Felder breiten Bahn jeden Gegner einmal für ${n(u.dmg * m)} Schaden${u.hitsAir ? '' : ' (keine Flieger)'}.`);
    else if (u.spin) out.push(`Alle ${d(u.atk)} s ein Rundumschlag: ${n(u.dmg * m)} Schaden an allen Bodentruppen im Umkreis von ${d(u.spin + u.r)} Feldern um sie herum.`);
    else out.push(`${u.range >= 2 ? `${Sie} schießt alle ${d(u.atk)} s aus ${d(u.range)} Feldern` : `${Sie} schlägt alle ${d(u.atk)} s zu`} – ${n(u.dmg * m)} Schaden${u.splash ? ` an allem im Umkreis von ${F(u.splash)} um das Ziel` : ''}${u.multi ? `, auf ${u.multi} verschiedene Ziele zugleich` : ''}.`);
    if (u.line && u.line.back) out.push('Am Ende der Bahn kehrt das Geschoss um und trifft auf dem Rückweg alle noch einmal – in Summe also doppelter Schaden.');
    if (u.recoil) out.push(`Jeder Schuss wirft sie ${d(u.recoil)} Felder nach hinten – weg von dem, was auf sie zuläuft.`);
    if (u.stunArea) out.push(`Alles im Umkreis erstarrt ${d(u.stunArea)} s lang zu Eis – Truppen, Gebäude und auch Türme.`);
    if (u.healBurst) out.push(`Beim Zerplatzen heilt sie alle deine Truppen im Umkreis von ${d(u.healBurst.r)} Feldern um ${n(u.healBurst.amt * m)}.`);
    if (u.combo) out.push(`Jeder ${u.combo.every}. Schlag trifft ${u.combo.f}-fach (${n(u.dmg * m * u.combo.f)}) und stößt leichte Truppen ${d(u.combo.knock)} Felder zurück.`);
    if (u.frenzy && u.frenzy.reset) out.push(`Solange sie steht und schießt, wird sie mit jedem Schuss schneller: Der Abstand sinkt von ${d(u.atk * u.frenzy.f)} s Schritt für Schritt auf ${d(u.atk * Math.pow(u.frenzy.f, u.frenzy.max))} s nach ${u.frenzy.max} Schüssen. Muss sie laufen oder verliert sie ihr Ziel, beginnt sie wieder langsam.`);
    if (u.curse) out.push(`Fluch: Wen ihr Geschoss trifft, der ist ${d(u.curse.dur)} s lang verflucht. Stirbt er in dieser Zeit – egal wodurch –, entsteht an seiner Stelle ein ${NAME[u.curse.unit][0]} (${n(UNITS[u.curse.unit].hp * m)} Leben, ${n(UNITS[u.curse.unit].dmg * m)} Schaden), der für dich auf Gebäude losgeht.`);
    if (u.hook) out.push(`Haken: Steht ihr Bodenziel ${d(u.hook.min)} bis ${u.hook.max} Felder entfernt, holt sie ${d(u.hook.wind)} s aus und wirft. Truppen zieht der Haken direkt vor sie (kurz betäubt und gebremst); an Gebäude und Türme zieht sie sich selbst heran – auch quer über den Fluss.`);
    if (u.minRange) out.push(`Was näher als ${d(u.minRange)} Felder steht, kann ${sie} nicht treffen. Stell ${sie} an den Fluss: Von dort reicht ${sie} bis zum gegnerischen Außenturm.`);
    if (build && u.range >= 9 && !u.minRange) out.push('Am Flussufer aufgestellt reicht es bis zum gegnerischen Außenturm – und der Turm kann nicht zurückschießen.');
    if (u.load) out.push(`Vor dem ersten Schuss lädt ${sie} ${d(u.load)} s.${u.resetOnStun ? ' Jede Betäubung setzt die Ladung zurück – ein Funkenschlag im richtigen Moment kostet sie den ganzen Schuss.' : ''}`);
    if (u.towerDmg) out.push(`An Türmen richtet sie nur ein Viertel an (${n(u.dmg * m * u.towerDmg)} je Schlag).`);
    if (u.knock) out.push(`Leichte Truppen werden ${d(u.knock)} Feld zurückgestoßen; ihr Anlauf oder Angriff beginnt neu.`);
    if (u.slow) out.push(`Getroffene laufen und schlagen ${d(u.slow)} s lang 30 % langsamer.`);
    if (u.stunHit) out.push(`Jeder Treffer betäubt ${d(u.stunHit)} s: Angriffe brechen ab, Anläufe und Ladungen beginnen von vorn (Türme ausgenommen).`);
    if (u.charge) out.push(`Ansturm: Läuft sie ${d(u.charge.after)} s ohne Unterbrechung, verdoppelt sie ihr Tempo, und der erste Stoß trifft mit ${n(u.dmg * m * u.charge.dmg)} Schaden. Betäuben oder Festhalten bricht den Anlauf ab.`);
    if (u.leap) out.push(`Sprung: Steht ein Bodenziel ${d(u.leap.min)} bis ${u.leap.max} Felder entfernt, springt sie es an und trifft mit doppelter Wucht (${n(u.dmg * m * u.leap.dmg)}).${u.dashGuard ? ' Im Sprung ist sie unverwundbar und lässt sich nicht betäuben.' : ''}`);
    if (u.healHit) out.push(`Bei jedem Schlag heilt sie alle deine Truppen im Umkreis von ${d(u.healHit.r)} Feldern um ${n(u.healHit.amt * m)} – sich selbst eingeschlossen.`);
    if (u.stealth) out.push(`Unsichtbar: Hat sie ${d(u.stealth)} s lang nicht zugeschlagen, bemerken Truppen, Gebäude und Türme sie nicht. Zauber treffen sie trotzdem.`);
  }
  if (u.second) { const q = u.second; out.push(`Unabhängig davon greift ${q.count > 1 ? 'ihre Besatzung' : sie} alle ${d(q.atk)} s Ziele im Umkreis von ${d(q.range)} Feldern an${q.minRange ? ` (aber nichts, was näher als ${d(q.minRange)} Felder steht)` : ''}: ${q.count > 1 ? `${q.count} Geschosse mit je ` : ''}${n(q.dmg * m)} Schaden${q.splash ? ` an allem im Umkreis von ${d(q.splash)} Feldern um das Ziel` : ''}${q.hitsAir ? ', auch auf Flieger' : ''}.${q.root ? ` Getroffene Truppen sind ${d(q.root)} s festgehalten.` : ''}${q.units ? ' Gebäude und Türme lässt dieser Angriff aus.' : ''}`); }
  if (u.reflect) out.push(`Rückschlag: Jeder Angreifer, der sie aus höchstens ${d(u.reflect.r)} Feldern Abstand trifft, bekommt ${n(u.reflect.dmg * m)} Schaden zurück (Türme ${n(u.reflect.dmg * m * u.reflect.towerF)}) und ist ${d(u.reflect.stun)} s betäubt. Schützen mit größerem Abstand bleiben verschont – Zauber ebenso.`);
  if (u.enchant) out.push(`Runenzeichen: Die ${u.enchant.count} nächsten deiner Truppen im Umkreis von ${d(u.enchant.r)} Feldern werden gezeichnet. Jeder ${u.enchant.every}. Treffer einer gezeichneten Truppe richtet ${n(u.enchant.bonus * m)} Zusatzschaden an. Fällt sie, erlöschen die Zeichen.`);
  if (u.morph) { const t = UNITS[u.morph.unit]; out.push(t.building
    ? `Bei halbem Leben bricht die Achse: ${Sie} bleibt als Gebäude stehen, schießt weiter wie zuvor, zieht Gebäude-Angreifer auf sich und zerfällt nach ${t.life} s. Auf einer Brücke bleibt ${sie} nie stehen.`
    : `Bei halbem Leben zündet sie die Lunte: Sie wird sehr schnell, läuft nur noch zu Gebäuden und geht dort mit ${n(t.dmg * m)} Schaden im Umkreis von ${d(t.splash)} Feldern hoch – spätestens nach ${t.life} s, und auch dann, wenn sie vorher fällt.`); }
  if (u.deployDmg) out.push(`${build ? 'Beim Ausbrechen' : 'Landung: Beim Aufsetzen'} ${n(u.deployDmg.dmg * m)} Schaden an allen Bodentruppen im Umkreis von ${d(u.deployDmg.r)} Feldern.`);
  if (u.spawn) out.push(`Alle ${d(u.spawn.every)} s ${u.spawn.count > 1 ? `kommen ${u.spawn.count} ${NAME[u.spawn.unit][1]}` : `kommt ${some(u.spawn.unit, 1)}`} hervor (${n(UNITS[u.spawn.unit].hp * m)} Leben, ${n(UNITS[u.spawn.unit].dmg * m)} Schaden) – zum ersten Mal ${d(u.spawn.first)} s nach dem Aufstellen.`);
  if (u.kraft) out.push(`Alle ${d(u.kraft.every)} s liefert er eine Kraft – über seine ganze Lebensdauer ${Math.floor(u.life / u.kraft.every)}. Das lohnt sich erst, wenn er lange genug steht.`);
  if (u.deathDmg) out.push(`Beim Tod: ${n(u.deathDmg.dmg * m)} Schaden im Umkreis von ${d(u.deathDmg.r)} Feldern${u.deathDmg.delay ? ` – nach ${u.deathDmg.delay} s Lunte, in denen Gegner noch weglaufen können; trifft auch Flieger` : ' an allem am Boden'}${u.deathDmg.slow ? `, dazu ${d(u.deathDmg.slow)} s lang 30 % langsamer` : ''}.`);
  if (u.deathSpawn) { const k = u.deathSpawn, t = UNITS[k.unit];
    if (t.hatch) out.push(`Beim Tod bleibt ein Ei mit ${n(t.hp * m)} Leben zurück. Bleibt es ${d(t.hatch.after)} s heil, schlüpft daraus wieder ein ${NAME[t.hatch.unit][0]} mit vollem Leben – so oft, bis ein Ei zerstört wird.`);
    else if (t.targets === 'buildings') out.push(`Beim Tod zerbricht ${sie} in ${k.count} ${NAME[k.unit][1]} (je ${n(t.hp * m)} Leben), die weiter zu den Gebäuden laufen.`);
    else out.push(`${u.kamikaze ? 'Am Ziel – und auch wenn sie vorher fällt –' : build ? (u.life ? 'Wird es zerstört oder läuft seine Zeit ab,' : 'Wird es zerstört,') : 'Beim Tod'} ${k.count > 1 ? `erscheinen ${k.count} ${NAME[k.unit][1]}` : `erscheint ${some(k.unit, 1)}`} (${k.count > 1 ? 'je ' : ''}${n(t.hp * m)} Leben, ${n(t.dmg * m)} Schaden).`); }
  if (u.bounty) out.push(`Der Haken: Jedes Stück, das fällt, schenkt dem Gegner Kraft – insgesamt ${d(bounty(u))}, wenn alle Teile zerschlagen werden. Gegen wenig Schaden ein Geschenk an dich, gegen viel Schaden eines an ihn.`);
  if (u.deathZone) { const z = CARDS[u.deathZone]; out.push(`Beim Tod bleibt eine ${z.name} zurück: Deine Truppen im Umkreis von ${d(z.radius)} Feldern laufen und schlagen ${z.haste} s lang 30 % schneller.`); }
  if (c.hero) out.push(`Held: Er steht nur einmal auf dem Feld; seine Karte kehrt erst in den Stapel zurück, wenn er gefallen ist. Fähigkeit „${c.ability.name}“ (Knopf im Kampf, ${c.ability.cost} Kraft, alle ${c.ability.cd} s): ${c.ability.desc}`);
  if (RUNES[id]) out.push(`Runenform ab Kartenstufe ${RUNE_LEVEL}: Jede ${RUNES[id].cycles + 1}. Ausspielung erscheint in der stärkeren Form – ${RUNES[id].desc}`);
  out.push('Mit jeder Kartenstufe wachsen Leben und Schaden um 10 %.');
  return out;
}
