# Star Swarm

Shooter espacial retro para celular, no estilo dos clássicos arcades de enxame alienígena dos anos 80. Feito do zero em HTML5 Canvas, sem dependências nem assets externos (gráficos em pixel art e sons gerados por código).

## Como jogar

- **Celular:** arraste o dedo em qualquer lugar da tela para mover a nave; enquanto o dedo estiver na tela ela atira automaticamente.
- **Teclado:** setas ou A/D para mover, espaço para atirar, P/Esc para pausar.

## Recursos

- Inimigos entram em ondas com trajetórias curvas, formam um enxame que balança/respira e mergulham em ataques.
- Comandantes (verdes) aguentam dois tiros, mergulham com escolta e podem lançar um **raio trator** que captura sua nave.
- Abata o comandante enquanto ele mergulha para **resgatar** a nave capturada e jogar com duas naves (tiro duplo).
- **Fase bônus** a cada quatro fases (3, 7, 11…): 40 inimigos sem atirar, 10.000 pontos se acertar todos.
- Vida extra aos 20.000 e 70.000 pontos e depois a cada 70.000, recorde salvo no aparelho.
- PWA instalável e offline (manifest + service worker), tela cheia em modo retrato, vibração ao ser atingido.

## Rodar localmente

```bash
cd galaga-mobile/www
python3 -m http.server 8000
```

Abra `http://localhost:8000` (ou o IP da máquina na rede local, no celular). Para instalar, use "Adicionar à tela inicial" no navegador. Adicione `?debug` à URL para expor `window.__starSwarm` com o estado do jogo.
