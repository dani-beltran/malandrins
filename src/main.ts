import './style.css';
import { Game } from './core/Game';
const root = document.getElementById('ui')!;
root.innerHTML =
  '<div class="loading-screen"><h1>MALANDRINS.</h1><p>Putting the town on the map…<br>Posem el poble al mapa…</p></div>';
let game: Game | undefined;
async function boot(): Promise<void> {
  try {
    game = new Game(document.getElementById('world') as HTMLCanvasElement, root);
    await game.initialize();
  } catch (error) {
    console.error('Malandrins initialization failed:', error);
    root.innerHTML =
      '<div class="loading-screen"><h1>MALANDRINS.</h1><p>The town couldn’t load. Please enable WebGL 2 and hardware acceleration, then reload.<br>No s’ha pogut carregar el poble. Activa WebGL 2 i l’acceleració gràfica i torna-ho a provar.</p><button class="primary-button" id="reload">Try again / Torna-ho a provar</button></div>';
    document.getElementById('reload')!.onclick = () => location.reload();
  }
}
if (import.meta.env.DEV)
  Object.defineProperty(window, 'malandrins', {
    value: Object.freeze({ inspect: () => game?.getDiagnostics() }),
    configurable: true,
  });
void boot();
if (import.meta.hot) import.meta.hot.dispose(() => game?.dispose());
