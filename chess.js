// chess.js — Lógica principal + UI (usa aiWorker.js como Web Worker)

/* ---------------- DOM ---------------- */
const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const restartBtn = document.getElementById("restartBtn");
const depthSelect = document.getElementById("depth");

/* ---------------- Estado ---------------- */
let board = [];
let turn = "w"; // "w" blancas, "b" negras (IA)
let selected = null;
let legalTargets = []; // movimientos legales para la pieza seleccionada
let castling = { wK:true, wQ:true, bK:true, bQ:true };
let enPassant = null; // target square (object {r,c}) or null

/* Unicode pieces for display */
const piecesSymbols = {
  P:"♙", R:"♖", N:"♘", B:"♗", Q:"♕", K:"♔",
  p:"♟", r:"♜", n:"♞", b:"♝", q:"♛", k:"♚"
};

/* Worker IA */
const aiWorker = new Worker("aiWorker.js");
aiWorker.onmessage = function(e){
  const m = e.data; // expects {r1,c1,r2,c2} or null
  if(!m) {
    statusEl.textContent = "IA no encontró movimiento.";
    return;
  }
  executeMove(m);
  turn = "w";
  updateStatus();
  drawBoard();
  checkEndGame();
};

/* ------------- Inicializar ------------- */
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
  turn="w";
  selected=null;
  legalTargets=[];
  castling={ wK:true,wQ:true,bK:true,bQ:true };
  enPassant=null;
  updateStatus();
  drawBoard();
  restartBtn.style.display="none";
}

/* ------------- Render ------------- */
function drawBoard(){
  boardEl.innerHTML="";
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const sq = document.createElement("div");
      sq.className = "square " + ((r+c)%2===0 ? "light" : "dark");
      sq.dataset.r=r; sq.dataset.c=c;

      // highlight if legal target
      if(legalTargets.some(m=>m.r2===r && m.c2===c)) {
        const isCapture = board[r][c] && ((turn==="w" && board[r][c]===board[r][c].toLowerCase()) || (turn==="b" && board[r][c]===board[r][c].toUpperCase()));
        sq.classList.add(isCapture ? "capture" : "highlight");
      }

      const p = board[r][c];
      if(p){
        const el = document.createElement("div");
        el.className = "piece " + (p===p.toUpperCase() ? "white" : "black");
        el.textContent = piecesSymbols[p] || p;
        sq.appendChild(el);
      }

      sq.addEventListener("click", onClickSquare);
      boardEl.appendChild(sq);
    }
  }
}

/* ------------- Click handler ------------- */
function onClickSquare(e){
  const r = parseInt(e.currentTarget.dataset.r,10);
  const c = parseInt(e.currentTarget.dataset.c,10);

  // Si es turno humano (blancas) — valida movimientos legales
  if(turn !== "w") return;

  const clickedPiece = board[r][c];

  // If selecting a piece of the current player
  if(!selected){
    if(clickedPiece && clickedPiece === clickedPiece.toUpperCase()){
      selected = {r,c};
      legalTargets = generateLegalMoves("w").filter(m => m.r1===r && m.c1===c);
      drawBoard();
    }
    return;
  }

  // If clicked the same square, deselect
  if(selected.r===r && selected.c===c){
    selected=null; legalTargets=[]; drawBoard(); return;
  }

  // Try to find legal move
  const move = legalTargets.find(m=>m.r2===r && m.c2===c);
  if(move){
    executeMove(move);
    selected=null; legalTargets=[];
    turn="b"; updateStatus(); drawBoard();
    if(checkEndGame()) return;
    // start IA
    setTimeout(()=> aiTurn(), 80);
  } else {
    // If clicked on another own piece, switch selection
    if(clickedPiece && clickedPiece === clickedPiece.toUpperCase()){
      selected={r,c};
      legalTargets = generateLegalMoves("w").filter(m => m.r1===r && m.c1===c);
      drawBoard();
    } else {
      // invalid click -> clear
      selected=null; legalTargets=[]; drawBoard();
    }
  }
}

/* ------------- Ejecuta movimiento (usa mismo formato que IA) ------------- */
function executeMove(m){
  const piece = board[m.r1][m.c1];
  const cap = board[m.r2][m.c2];

  // Pawn en passant capture handling:
  const isPawn = piece && piece.toLowerCase()==="p";
  // Move piece
  board[m.r2][m.c2] = piece;
  board[m.r1][m.c1] = "";

  // If pawn moved two, set enPassant target (the square passed over)
  if(isPawn && Math.abs(m.r2 - m.r1) === 2){
    enPassant = { r: (m.r1 + m.r2)/2, c: m.c1 }; // square that can be captured onto
  } else {
    enPassant = null;
  }

  // En passant capture: when pawn moves diagonally into empty square that's enPassant target, remove captured pawn
  if(isPawn && cap === "" && m.c1 !== m.c2){
    // captured pawn is on the row m.r1 (origin row) ? actually it's on m.r1 (the pawn that moved 2) or m.r1? Correct: captured pawn is on same file as destination but on pawn's original row?
    // Standard: captured pawn is located at (m.r1, m.c2) if en passant.
    if(m.r2 === enPassant?.r && m.c2 === enPassant?.c){
      // remove the pawn that moved two squares (which stands at m.r1? Actually moving pawn stands at m.r2; the pawn captured is at m.r1 + ?)
      // The pawn being captured sits on row m.r1 (the capturing pawn's original row)? For correct removal:
      // Captured pawn is at row m.r1 (the capturing pawn's original row) for standard coordinates: simpler & reliable:
      board[m.r1][m.c2] = "";
    } else {
      // fallback: if destination empty and move diagonal, remove the pawn on the adjacent square (common approach)
      board[m.r1][m.c2] = "";
    }
  }

  // Promotion (auto to queen)
  if(piece === "P" && m.r2 === 0) board[m.r2][m.c2] = "Q";
  if(piece === "p" && m.r2 === 7) board[m.r2][m.c2] = "q";

  // Castling rights update: if king or rook moved or rook captured
  if(piece === "K"){ castling.wK=false; castling.wQ=false; }
  if(piece === "k"){ castling.bK=false; castling.bQ=false; }

  if(piece === "R" && m.r1===7 && m.c1===0) castling.wQ=false;
  if(piece === "R" && m.r1===7 && m.c1===7) castling.wK=false;
  if(piece === "r" && m.r1===0 && m.c1===0) castling.bQ=false;
  if(piece === "r" && m.r1===0 && m.c1===7) castling.bK=false;

  // If rook captured, update opponent castling rights
  if(cap === "R"){ if(m.r2===7 && m.c2===0) castling.wQ=false; if(m.r2===7 && m.c2===7) castling.wK=false; }
  if(cap === "r"){ if(m.r2===0 && m.c2===0) castling.bQ=false; if(m.r2===0 && m.c2===7) castling.bK=false; }

  // Handle castling rook move if king moved two squares
  if(piece === "K" && m.c2 - m.c1 === 2){ // white king kingside
    board[7][5] = "R"; board[7][7] = "";
  }
  if(piece === "K" && m.c2 - m.c1 === -2){ // white queen side
    board[7][3] = "R"; board[7][0] = "";
  }
  if(piece === "k" && m.c2 - m.c1 === 2){
    board[0][5] = "r"; board[0][7] = "";
  }
  if(piece === "k" && m.c2 - m.c1 === -2){
    board[0][3] = "r"; board[0][0] = "";
  }
}

/* ------------- Turno IA ------------- */
function aiTurn(){
  // send copy of board to worker
  const depth = parseInt(depthSelect.value,10) || 4;
  aiWorker.postMessage({
    command: "start",
    board: board.map(r=>r.slice()),
    castling: {...castling},
    enPassant: enPassant? {...enPassant} : null,
    depth
  });
  statusEl.textContent = "IA calculando...";
}

/* ------------- Status & restart & endgame ------------- */
function updateStatus(){
  statusEl.textContent = (turn==="w") ? "Turno de Blancas" : "Turno de Negras (IA)";
}

restartBtn.addEventListener("click", ()=>{ initBoard(); });

function checkEndGame(){
  // check kings
  let w=false,b=false;
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    if(board[r][c]==="K") w=true;
    if(board[r][c]==="k") b=true;
  }
  if(!w){ statusEl.textContent = "¡Fin! Ganó la IA"; restartBtn.style.display="block"; return true; }
  if(!b){ statusEl.textContent = "¡Fin! Ganaste"; restartBtn.style.display="block"; return true; }

  // checkmate/stalemate detection simplified:
  if(turn==="w"){
    const moves = generateLegalMoves("w");
    if(moves.length===0){
      if(kingInCheck("w")) { statusEl.textContent="¡Jaque mate! Ganó la IA"; restartBtn.style.display="block"; return true; }
      else { statusEl.textContent="¡Tablas! (sin movimientos)"; restartBtn.style.display="block"; return true; }
    }
  } else {
    const moves = generateLegalMoves("b");
    if(moves.length===0){
      if(kingInCheck("b")) { statusEl.textContent="¡Jaque mate! Ganaste"; restartBtn.style.display="block"; return true; }
      else { statusEl.textContent="¡Tablas! (sin movimientos)"; restartBtn.style.display="block"; return true; }
    }
  }

  return false;
}

/* ------------- Movimiento legal generation (todas las reglas) ------------- */
function generateLegalMoves(color){
  let moves=[];
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const p = board[r][c];
      if(!p) continue;
      if((color==="w" && p===p.toUpperCase()) || (color==="b" && p===p.toLowerCase())){
        moves.push(...pieceMoves(r,c,p));
      }
    }
  }
  // filter out moves that leave king in check
  return moves.filter(m => !leavesKingInCheck(m, color));
}

function leavesKingInCheck(m, color){
  const piece = board[m.r1][m.c1], cap = board[m.r2][m.c2];
  board[m.r2][m.c2] = piece; board[m.r1][m.c1] = "";
  // special handling for en passant simulated capture:
  let removed = null;
  if(piece && piece.toLowerCase()==="p" && cap === "" && m.c1 !== m.c2){
    // captured pawn is at m.r1 (origin row) and column m.c2
    removed = {r:m.r1, c:m.c2, val: board[m.r1][m.c2] };
    board[m.r1][m.c2] = "";
  }

  const inCheck = kingInCheck(color);

  // undo
  board[m.r1][m.c1] = piece; board[m.r2][m.c2] = cap;
  if(removed) board[removed.r][removed.c] = removed.val;
  return inCheck;
}

function kingInCheck(color){
  const king = findKing(color);
  if(!king) return false;
  const enemy = color==="w" ? "b" : "w";
  return generatePseudoMoves(enemy).some(m => m.r2===king.r && m.c2===king.c);
}

function findKing(color){
  const target = color==="w" ? "K" : "k";
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    if(board[r][c] === target) return {r,c};
  }
  return null;
}

function generatePseudoMoves(color){
  // like generateLegalMoves but without filtering out checks (used to detect attacks)
  let moves=[];
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const p = board[r][c];
      if(!p) continue;
      if((color==="w" && p===p.toUpperCase()) || (color==="b" && p===p.toLowerCase())){
        moves.push(...pieceMoves(r,c,p));
      }
    }
  }
  return moves;
}

/* pieceMoves implements all piece movement rules (including castling & en passant target usage) */
function pieceMoves(r,c,p){
  let moves = [];
  const enemy = p===p.toUpperCase() ? "b" : "w";

  function add(r2,c2){
    if(r2<0||r2>7||c2<0||c2>7) return;
    const t = board[r2][c2];
    if(!t || (enemy==="b" && t===t.toLowerCase()) || (enemy==="w" && t===t.toUpperCase())){
      moves.push({r1:r,c1:c,r2,c2});
    }
  }

  function slideMoves(dirs){
    let out=[];
    for(const [dr,dc] of dirs){
      let nr=r+dr, nc=c+dc;
      while(nr>=0 && nr<8 && nc>=0 && nc<8){
        const t = board[nr][nc];
        if(!t) out.push({r1:r,c1:c,r2:nr,c2:nc});
        else{
          if((enemy==="b" && t===t.toLowerCase()) || (enemy==="w" && t===t.toUpperCase())) out.push({r1:r,c1:c,r2:nr,c2:nc});
          break;
        }
        nr+=dr; nc+=dc;
      }
    }
    return out;
  }

  switch(p.toLowerCase()){
    case "p": {
      const dir = (p==="P") ? -1 : 1;
      // single forward
      if(board[r+dir]?.[c] === "") add(r+dir,c);
      // double forward
      if((p==="P" && r===6) || (p==="p" && r===1)){
        if(board[r+dir]?.[c] === "" && board[r+2*dir]?.[c] === "") add(r+2*dir,c);
      }
      // captures
      for(const dc of [-1,1]){
        const t = board[r+dir]?.[c+dc];
        if(t){
          if((p==="P" && t===t.toLowerCase()) || (p==="p" && t===t.toUpperCase())) add(r+dir,c+dc);
        }
        // en passant capture possibility: enPassant is target square that pawn passed over
        if(enPassant && enPassant.r === r+dir && enPassant.c === c+dc){
          add(r+dir,c+dc);
        }
      }
      break;
    }
    case "n":
      [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]].forEach(([dr,dc])=>add(r+dr,c+dc));
      break;
    case "b":
      moves.push(...slideMoves([[1,1],[1,-1],[-1,1],[-1,-1]]));
      break;
    case "r":
      moves.push(...slideMoves([[1,0],[-1,0],[0,1],[0,-1]]));
      break;
    case "q":
      moves.push(...slideMoves([[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]]));
      break;
    case "k":
      for(let dr=-1; dr<=1; dr++){
        for(let dc=-1; dc<=1; dc++){
          if(dr===0 && dc===0) continue;
          add(r+dr,c+dc);
        }
      }
      // Castling (basic checks: rook and path empty; final legality checked by leavesKingInCheck)
      if(p==="K"){
        if(castling.wK && board[7][5]==="" && board[7][6]===""){
          // ensure king does not pass through check
          if(!isSquareAttacked(7,4,"b") && !isSquareAttacked(7,5,"b") && !isSquareAttacked(7,6,"b"))
            moves.push({r1:7,c1:4,r2:7,c2:6});
        }
        if(castling.wQ && board[7][1]==="" && board[7][2]==="" && board[7][3]===""){
          if(!isSquareAttacked(7,4,"b") && !isSquareAttacked(7,3,"b") && !isSquareAttacked(7,2,"b"))
            moves.push({r1:7,c1:4,r2:7,c2:2});
        }
      }
      if(p==="k"){
        if(castling.bK && board[0][5]==="" && board[0][6]===""){
          if(!isSquareAttacked(0,4,"w") && !isSquareAttacked(0,5,"w") && !isSquareAttacked(0,6,"w"))
            moves.push({r1:0,c1:4,r2:0,c2:6});
        }
        if(castling.bQ && board[0][1]==="" && board[0][2]==="" && board[0][3]===""){
          if(!isSquareAttacked(0,4,"w") && !isSquareAttacked(0,3,"w") && !isSquareAttacked(0,2,"w"))
            moves.push({r1:0,c1:4,r2:0,c2:2});
        }
      }
      break;
  }

  return moves;
}

function isSquareAttacked(r, c, byColor){
  // quick check: does any pseudo enemy move target (r,c)?
  return generatePseudoMoves(byColor).some(m => m.r2===r && m.c2===c);
}

/* ------------- Utilitarios ------------- */
function updateStatus(){
  statusEl.textContent = (turn==="w") ? "Turno de Blancas" : "Turno de Negras (IA)";
}

/* ------------- Init ------------- */
initBoard();


