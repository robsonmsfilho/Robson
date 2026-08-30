# Ape Climb

Jogo de plataforma retro estilo arcade classico para mobile, no estilo do
Donkey Kong original: desvie de barris, suba escadas, use o martelo e
resgate a garota do gorila gigante no topo da construcao. Tres fases
(barris, chamas e rebites) que se repetem em ciclos cada vez mais dificeis.

Feito em HTML5 Canvas puro (sem bibliotecas de jogo), empacotado como PWA
instalavel e como app Android nativo via Capacitor.

## Estrutura do projeto

```
donkey-kong-mobile/
  www/                  jogo (HTML/CSS/JS), PWA (manifest + service worker)
  android/              projeto nativo Android gerado pelo Capacitor
  capacitor.config.json
  package.json
```

## Jogar no navegador

Nao precisa de build. Basta servir a pasta `www`:

```
npm install
npm run serve
```

Abra `http://localhost:8080`. Funciona em desktop (teclado: setas + espaco
para pular, P para pausar) e em celular (D-pad e botao de salto na tela).

### Instalar como app (PWA)

Servido por HTTPS (ou localhost), o navegador do celular oferece
"Adicionar a tela inicial" / "Instalar app". O jogo funciona offline depois
da primeira visita graças ao service worker.

## Gerar o app Android (APK)

O projeto nativo ja esta gerado em `android/`. Para compilar localmente
(requer Android Studio ou Android SDK + JDK 17+):

```
npm install
npx cap sync android
cd android
./gradlew assembleDebug
```

O APK fica em `android/app/build/outputs/apk/debug/app-debug.apk`.

Tambem e possivel abrir o projeto direto no Android Studio:

```
npx cap open android
```

### Build automatico (CI)

O workflow `.github/workflows/build-ape-climb-android.yml` compila o APK de
debug a cada push nesta branch e disponibiliza o resultado como artefato do
GitHub Actions (aba **Actions** do repositorio, sem precisar de Android
Studio local).

## Controles

- Teclado: setas para mover/subir/descer escadas, espaco para pular, P para
  pausar.
- Toque: D-pad e botao SALTO na parte inferior da tela.

## Sobre o jogo

Tres fases que se repetem em ciclo, ficando mais rapidas a cada volta
completa:

1. **25m - Barris**: desvie ou pule os barris que rolam pelas vigas e chegue
   ate a garota no topo.
2. **50m - Chamas**: alem dos barris, inimigos de fogo patrulham as vigas.
3. **100m - Rebites**: remova todos os rebites das vigas para derrubar o
   gorila e completar a fase.

Pegue o martelo para destruir barris e chamas por alguns segundos (mas voce
nao pode pular enquanto ele estiver ativo). Frutas dao pontos extra.

Jogo, graficos e sons sao originais deste projeto, feitos em HTML5 Canvas
com Web Audio API (sem assets externos).
