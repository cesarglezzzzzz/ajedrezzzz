let stopSearch = false;

// Valores de piezas
const pieceValues = { p:1, n:3, b:3, r:5, q:9, k:1000 };

// Variables del tablero
let board = [];
let castling = { wK:true, wQ:true, bK:true, bQ:true };
let enPassant = null;

// --- Recibe mensajes ---
self.onmessage = function(e){
  const { command, board:b, depth, castling:c, enPassant:ep } = e.data;
  if(command==="stop"){ stopSearch=true; return; }
  if(command==="start"){
    stopSearch=false;
    board = b.map(r=>r.slice());
    castling = {...c};
    enPassant = ep;
    const bestMove = iterativeDeepening(depth);
    self.postMessage(bestMove);
  }
};

// --- Iterative Deepening ---
function iterativeDeepening(maxDepth){
  let bestMove=null;
  for(let depth=1; depth<=maxDepth; depth++){
    bestMove = minimaxRoot(depth, true);
    if(stopSearch) break;
  }
  return bestMove;
}

// --- Root Minimax ---
function minimaxRoot(depth, maximizingPlayer){
  let bestMove=null;
  let bestValue=-Infinity;
  const moves = generateLegalMoves("b").sort((a,b)=>pieceValues[board[b.r2][b.c2]?.toLowerCase()] - pieceValues[board[a.r2][a.c2]?.toLowerCase()]);
  
  for(let m of moves){
    makeMove(m);
    let value = minimax(depth-1, -Infinity, Infinity, false);
    undoMove(m);
    if(value > bestValue){ bestValue=value; bestMove=m; }
    if(stopSearch) break;
  }
  return bestMove;
}

// --- Minimax con Alpha-Beta ---
function minimax(depth, alpha, beta, maximizing){
  if(depth===0) return evaluateBoard();

  const color = maximizing ? "b" : "w";
  const moves = generateLegalMoves(color);
  if(maximizing){
    let maxEval = -Infinity;
    for(let m of moves){
      makeMove(m);
      let evalScore = minimax(depth-1, alpha, beta, false);
      undoMove(m);
      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if(beta <= alpha) break;
      if(stopSearch) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for(let m of moves){
      makeMove(m);
      let evalScore = minimax(depth-1, alpha, beta, true);
      undoMove(m);
      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if(beta <= alpha) break;
      if(stopSearch) break;
    }
    return minEval;
  }
}

// --- Evaluación simple ---
function evaluateBoard(){
  let score=0;
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const p = board[r][c]; if(!p) continue;
      const val = pieceValues[p.toLowerCase()] || 0;
      score += p===p.toUpperCase() ? -val : val;
    }
  }
  return score;
}

// --- Mover/Deshacer ---
function makeMove(m){
  m.captured = board[m.r2][m.c2];
  board[m.r2][m.c2] = board[m.r1][m.c1];
  board[m.r1][m.c1] = "";
}
function undoMove(m){
  board[m.r1][m.c1] = board[m.r2][m.c2];
  board[m.r2][m.c2] = m.captured;
}

// --- Genera movimientos legales ---
function generateLegalMoves(color){
  let moves = [];
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const p = board[r][c];
      if(!p) continue;
      if((color==="w" && p===p.toUpperCase())||(color==="b" && p===p.toLowerCase())){
        moves.push(...pieceMoves(r,c,p));
      }
    }
  }
  return moves;
}

// --- Movimiento de piezas ---
function pieceMoves(r,c,p){
  let moves = [];
  const enemy = p===p.toUpperCase() ? "b" : "w";

  function add(r2,c2){
    if(r2<0||r2>7||c2<0||c2>7) return;
    const t = board[r2][c2];
    if(!t || (enemy==="b"&&t===t.toLowerCase())||(enemy==="w"&&t===t.toUpperCase()))
      moves.push({r1:r, c1:c, r2, c2});
  }

  function slide(dirs){
    let res=[];
    for(let [dr,dc] of dirs){
      let nr=r+dr, nc=c+dc;
      while(nr>=0 && nr<8 && nc>=0 && nc<8){
        const t=board[nr][nc];
        if(!t) res.push({r1:r,c1:c,r2:nr,c2:nc});
        else{ if((enemy==="b"&&t===t.toLowerCase())||(enemy==="w"&&t===t.toUpperCase())) res.push({r1:r,c1:c,r2:nr,c2:nc}); break; }
        nr+=dr; nc+=dc;
      }
    }
    return res;
  }

  switch(p.toLowerCase()){
    case "p":
      let dir = p==="P"?-1:1;
      if(!board[r+dir]?.[c]) add(r+dir,c);
      if((p==="P"&&r===6)||(p==="p"&&r===1)) if(!board[r+dir]?.[c] && !board[r+2*dir]?.[c]) add(r+2*dir,c);
      for(let dc of [-1,1]){
        let t = board[r+dir]?.[c+dc];
        if(t && ((p==="P"&&t===t.toLowerCase())||(p==="p"&&t===t.toUpperCase()))) add(r+dir,c+dc);
      }
      break;
    case "n": [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]].forEach(([dr,dc])=>add(r+dr,c+dc)); break;
    case "b": moves.push(...slide([[1,1],[1,-1],[-1,1],[-1,-1]])); break;
    case "r": moves.push(...slide([[1,0],[-1,0],[0,1],[0,-1]])); break;
    case "q": moves.push(...slide([[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]])); break;
    case "k": for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++) if(dr||dc) add(r+dr,c+dc); break;
  }

  return moves;
}


