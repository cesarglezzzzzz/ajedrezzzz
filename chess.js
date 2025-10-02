// --- Variables globales ---
let board = [
  ["r","n","b","q","k","b","n","r"],
  ["p","p","p","p","p","p","p","p"],
  ["","","","","","","",""],
  ["","","","","","","",""],
  ["","","","","","","",""],
  ["","","","","","","",""],
  ["P","P","P","P","P","P","P","P"],
  ["R","N","B","Q","K","B","N","R"]
];

let selectedPiece = null;
let castling = { wK:true, wQ:true, bK:true, bQ:true };
let enPassant = null;

const boardEl = document.getElementById("board");

// --- Inicializar tablero ---
function drawBoard(){
  boardEl.innerHTML="";
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const cell = document.createElement("div");
      cell.classList.add("cell");
      if((r+c)%2===0) cell.classList.add("white");
      else cell.classList.add("black");
      cell.dataset.r = r;
      cell.dataset.c = c;

      const piece = board[r][c];
      if(piece){
        const pieceEl = document.createElement("div");
        pieceEl.classList.add("piece");
        pieceEl.textContent = piece;
        pieceEl.dataset.r = r;
        pieceEl.dataset.c = c;
        cell.appendChild(pieceEl);
      }

      cell.addEventListener("click", onClickCell);
      boardEl.appendChild(cell);
    }
  }
}

function onClickCell(e){
  const r = parseInt(e.currentTarget.dataset.r);
  const c = parseInt(e.currentTarget.dataset.c);
  const piece = board[r][c];

  // Seleccionar pieza propia
  if(piece && piece === piece.toUpperCase()){
    selectedPiece = {r,c};
    highlightMoves(selectedPiece);
    return;
  }

  // Mover pieza
  if(selectedPiece){
    const move = { r1:selectedPiece.r, c1:selectedPiece.c, r2:r, c2:c };
    if(isValidMove(move)){
      makeMove(move);
      selectedPiece=null;
      drawBoard();
      setTimeout(aiTurn, 100); // Turno IA
    }
  }
}

// --- Resalta movimientos legales ---
function highlightMoves(piecePos){
  const moves = generateLegalMoves("w").filter(m=>m.r1===piecePos.r && m.c1===piecePos.c);
  document.querySelectorAll(".cell").forEach(cell=>cell.classList.remove("highlight"));
  for(let m of moves){
    const cell = document.querySelector(`.cell[data-r='${m.r2}'][data-c='${m.c2}']`);
    if(cell) cell.classList.add("highlight");
  }
}

// --- Verifica si el movimiento es válido ---
function isValidMove(move){
  const legal = generateLegalMoves("w");
  return legal.some(m=>m.r1===move.r1 && m.c1===move.c1 && m.r2===move.r2 && m.c2===move.c2);
}

// --- Ejecutar movimiento ---
function makeMove(move){
  const piece = board[move.r1][move.c1];
  board[move.r2][move.c2] = piece;
  board[move.r1][move.c1] = "";
}

// --- Turno IA ---
const aiWorker = new Worker("aiWorker.js");
aiWorker.onmessage = function(e){
  const m = e.data;
  if(m) makeMove(m);
  drawBoard();
};

function aiTurn(){
  aiWorker.postMessage({command:"start", board, castling, enPassant, depth:6});
}

// --- Generar movimientos legales (ligero, para resaltar solo) ---
function generateLegalMoves(color){
  let moves=[];
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const p = board[r][c];
      if(!p) continue;
      if((color==="w"&&p===p.toUpperCase())||(color==="b"&&p===p.toLowerCase())){
        moves.push(...pieceMoves(r,c,p));
      }
    }
  }
  return moves;
}

// --- Movimientos de piezas ---
function pieceMoves(r,c,p){
  let moves=[], enemy = p===p.toUpperCase()?"b":"w";
  function add(r2,c2){
    if(r2<0||r2>7||c2<0||c2>7) return;
    let t = board[r2][c2];
    if(!t || (enemy==="b"&&t===t.toLowerCase())||(enemy==="w"&&t===t.toUpperCase()))
      moves.push({r1:r,c1:c,r2,c2});
  }
  function slideMoves(dirs){
    let res=[];
    for(let [dr,dc] of dirs){
      let nr=r+dr,nc=c+dc;
      while(nr>=0 && nr<8 && nc>=0 && nc<8){
        let t = board[nr][nc];
        if(!t) res.push({r1:r,c1:c,r2:nr,c2:nc});
        else{ if((enemy==="b"&&t===t.toLowerCase())||(enemy==="w"&&t===t.toUpperCase())) res.push({r1:r,c1:c,r2:nr,c2:nc}); break; }
        nr+=dr; nc+=dc;
      }
    }
    return res;
  }

  switch(p.toLowerCase()){
    case "p":
      let dir=p==="P"?-1:1;
      if(!board[r+dir]?.[c]) add(r+dir,c);
      if((p==="P"&&r===6)||(p==="p"&&r===1)) if(!board[r+dir]?.[c]&&!board[r+2*dir]?.[c]) add(r+2*dir,c);
      for(let dc of [-1,1]){
        let t=board[r+dir]?.[c+dc];
        if(t) if((p==="P"&&t===t.toLowerCase())||(p==="p"&&t===t.toUpperCase())) add(r+dir,c+dc);
      }
      break;
    case "n": [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]].forEach(([dr,dc])=>add(r+dr,c+dc)); break;
    case "b": moves.push(...slideMoves([[1,1],[1,-1],[-1,1],[-1,-1]])); break;
    case "r": moves.push(...slideMoves([[1,0],[-1,0],[0,1],[0,-1]])); break;
    case "q": moves.push(...slideMoves([[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]])); break;
    case "k": for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++) if(dr||dc) add(r+dr,c+dc); break;
  }
  return moves;
}

// --- Inicializa ---
drawBoard();

