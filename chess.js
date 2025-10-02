const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const restartBtn = document.getElementById("restartBtn");

let board = [];
let turn = "w";
let selected = null;
let castling = {wK:true,wQ:true,bK:true,bQ:true};
let enPassant = null;

// Piezas Unicode
const pieces = {
  P:"♙", R:"♖", N:"♘", B:"♗", Q:"♕", K:"♔",
  p:"♟", r:"♜", n:"♞", b:"♝", q:"♛", k:"♚"
};

// Worker IA
const aiWorker = new Worker("aiWorker.js");

// --- Inicializa tablero ---
function initBoard(){
  board = [
    ["r","n","b","q","k","b","n","r"],
    ["p","p","p","p","p","p","p","p"],
    ["","","","","","","",""],
    ["","","","","","","",""],
    ["","","","","","","",""],
    ["","","","","","","",""],
    ["P","P","P","P","P","P","P","P"],
    ["R","N","B","Q","K","B","N","R"]
  ];
  turn="w"; selected=null; castling={wK:true,wQ:true,bK:true,bQ:true}; enPassant=null;
  drawBoard(); updateStatus(); restartBtn.style.display="none";
}

// --- Dibuja tablero ---
function drawBoard(){
  boardEl.innerHTML="";
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const sq = document.createElement("div");
      sq.className="square "+((r+c)%2==0?"white":"black");
      sq.dataset.r=r; sq.dataset.c=c;
      sq.textContent = board[r][c]?pieces[board[r][c]]:"";
      sq.addEventListener("click", onClick);
      boardEl.appendChild(sq);
    }
  }
}

// --- Click del jugador ---
function onClick(e){
  if(turn!=="w") return;
  const r=parseInt(e.target.dataset.r), c=parseInt(e.target.dataset.c);
  if(selected){
    movePiece(selected.r,selected.c,r,c);
    selected=null;
  } else if(board[r][c] && board[r][c]===board[r][c].toUpperCase()){
    selected={r,c};
  }
}

// --- Mover pieza ---
function movePiece(r1,c1,r2,c2){
  if(turn!=="w") return;
  const moves = generatePlayerMoves("w"); // jugador mueve libremente
  const legal = moves.find(m=>m.r1===r1 && m.c1===c1 && m.r2===r2 && m.c2===c2);
  if(!legal) return;
  executeMove(legal);
  turn="b";
  updateStatus();
  drawBoard();
  if(checkEndGame()) return;
  setTimeout(aiTurn,50);
}

// --- Ejecuta movimiento ---
function executeMove(m){
  const p = board[m.r1][m.c1];
  board[m.r2][m.c2]=p; board[m.r1][m.c1]="";

  // En passant
  if(p.toLowerCase()==="p" && m.c2!==m.c1 && !board[m.r2][m.c2]) board[m.r1][m.c2]="";
  // Promoción
  if(p==="P" && m.r2===0) board[m.r2][m.c2]="Q";
  if(p==="p" && m.r2===7) board[m.r2][m.c2]="q";
  // Castling
  if(p==="K"){ castling.wK=false; castling.wQ=false; }
  if(p==="k"){ castling.bK=false; castling.bQ=false; }
  if(p==="R" && m.r1===7 && m.c1===0) castling.wQ=false;
  if(p==="R" && m.r1===7 && m.c1===7) castling.wK=false;
  if(p==="r" && m.r1===0 && m.c1===0) castling.bQ=false;
  if(p==="r" && m.r1===0 && m.c1===7) castling.bK=false;

  // Enroque
  if(p==="K" && m.c2-m.c1===2){ board[7][5]="R"; board[7][7]=""; }
  if(p==="K" && m.c2-m.c1===-2){ board[7][3]="R"; board[7][0]=""; }
  if(p==="k" && m.c2-m.c1===2){ board[0][5]="r"; board[0][7]=""; }
  if(p==="k" && m.c2-m.c1===-2){ board[0][3]="r"; board[0][0]=""; }
}

function aiTurn(){
  aiWorker.postMessage({
    command: "start",
    board: board,
    castling: castling,
    enPassant: enPassant,
    depth: 4
  });
}

aiWorker.onmessage = function(e){
  const bestMove = e.data;
  if(bestMove){
    executeMove(bestMove);
    turn="w";
    updateStatus();
    drawBoard();
    checkEndGame();
  }
};

// --- Estado ---
function updateStatus(){
  statusEl.textContent = turn==="w"?"Tu turno (modo entrenamiento)":"Turno de negras (IA)";
}

// --- Reinicio ---
restartBtn.onclick = initBoard;

// --- Fin de juego ---
function checkEndGame(){
  let white=false, black=false;
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    if(board[r][c]==="K") white=true;
    if(board[r][c]==="k") black=true;
  }
  if(!white){ statusEl.textContent="¡Fin! Ganó la IA"; restartBtn.style.display="block"; return true; }
  if(!black){ statusEl.textContent="¡Fin! Ganaste"; restartBtn.style.display="block"; return true; }
  return false;
}

// --- Movimientos del jugador: libre ---
function generatePlayerMoves(color){
  let moves=[];
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      let p=board[r][c];
      if(!p) continue;
      if((color==="w" && p===p.toUpperCase())||(color==="b" && p===p.toLowerCase())){
        moves.push(...pieceMoves(r,c,p));
      }
    }
  }
  return moves; // sin filtrar jaque
}

// --- Movimientos de la IA: legales ---
function generateLegalMoves(color){
  let moves=[];
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      let p=board[r][c];
      if(!p) continue;
      if((color==="w" && p===p.toUpperCase())||(color==="b" && p===p.toLowerCase())){
        moves.push(...pieceMoves(r,c,p));
      }
    }
  }
  return moves.filter(m=>!leavesKingInCheck(m,color));
}

// --- Verifica jaque ---
function leavesKingInCheck(m,color){
  const piece=board[m.r1][m.c1],cap=board[m.r2][m.c2];
  board[m.r2][m.c2]=piece; board[m.r1][m.c1]="";
  let inCheck=kingInCheck(color);
  board[m.r1][m.c1]=piece; board[m.r2][m.c2]=cap;
  return inCheck;
}

function kingInCheck(color){
  let kingPos=null;
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    let p=board[r][c];
    if((color==="w" && p==="K")||(color==="b" && p==="k")) kingPos={r,c};
  }
  if(!kingPos) return false; // evita errores si el rey fue capturado en simulaciones
  const enemy=color==="w"?"b":"w";
  return generatePseudoMoves(enemy).some(m=>m.r2===kingPos.r && m.c2===kingPos.c);
}

function generatePseudoMoves(color){
  let moves=[];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    let p=board[r][c]; if(!p) continue;
    if((color==="w"&&p===p.toUpperCase())||(color==="b"&&p===p.toLowerCase())){
      moves.push(...pieceMoves(r,c,p));
    }
  }
  return moves;
}

// --- Movimiento de piezas ---
function pieceMoves(r,c,p){
  let moves=[],enemy=p===p.toUpperCase()?"b":"w";
  function add(r2,c2){ 
    if(r2<0||r2>7||c2<0||c2>7) return;
    let t=board[r2][c2];
    if(!t || (enemy==="b"&&t===t.toLowerCase())||(enemy==="w"&&t===t.toUpperCase())) 
      moves.push({r1:r,c1:c,r2,c2}); 
  }

  function slideMoves(dirs){
    let res=[];
    for(let [dr,dc] of dirs){
      let nr=r+dr, nc=c+dc;
      while(nr>=0 && nr<8 && nc>=0 && nc<8){
        let t=board[nr][nc];
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

// --- Inicia ---
initBoard();
