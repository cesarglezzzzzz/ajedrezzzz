let stopSearch = false;

// Valores base de piezas
const pieceValues = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// Variables del tablero
let board = [];
let castling = { wK:true, wQ:true, bK:true, bQ:true };
let enPassant = null;

// --- Libro de aperturas ---
const openingBook = [
  { fen:"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR", move:{r1:1,c1:4,r2:3,c2:4} }, // 1.e4
  { fen:"rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR", move:{r1:0,c1:6,r2:2,c2:5} }, // 2.Cf6
];

// --- Mensajes ---
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

// --- Convierte tablero a FEN ---
function boardToFen(board){
  return board.map(r=>{
    let empty=0, str="";
    for(let c=0;c<8;c++){
      if(!r[c]) empty++;
      else { if(empty){ str+=empty; empty=0; } str+=r[c]; }
    }
    if(empty) str+=empty;
    return str;
  }).join("/");
}

// --- Checa libro de aperturas ---
function checkOpeningBook(board){
  const fen = boardToFen(board);
  const bookMove = openingBook.find(o => o.fen === fen);
  if(bookMove) return bookMove.move;
  return null;
}

// --- Iterative Deepening ---
function iterativeDeepening(maxDepth){
  const bookMove = checkOpeningBook(board);
  if(bookMove) return bookMove;

  let bestMove=null;
  for(let depth=1; depth<=maxDepth; depth++){
    bestMove = minimaxRoot(depth,true);
    if(stopSearch) break;
  }
  return bestMove;
}

// --- Root Minimax ---
function minimaxRoot(depth,maximizingPlayer){
  let bestMove=null;
  let bestValue=-Infinity;
  let moves = generateLegalMoves("b");
  
  // Ordenar por valor heurístico rápido
  moves.sort((a,b)=>pieceValue(board[b.r2][b.c2]||"") - pieceValue(board[a.r2][a.c2]||""));

  for(let m of moves){
    const piece = board[m.r1][m.c1], cap = board[m.r2][m.c2];
    board[m.r2][m.c2] = piece; board[m.r1][m.c1]="";
    let value = minimax(depth-1,-Infinity,Infinity,false);
    board[m.r1][m.c1] = piece; board[m.r2][m.c2] = cap;

    if(value > bestValue){ bestValue = value; bestMove = m; }
    if(stopSearch) break;
  }
  return bestMove;
}

// --- Minimax con Alpha-Beta ---
function minimax(depth,alpha,beta,maximizing){
  if(depth===0) return quiescence(alpha,beta,maximizing);

  let color = maximizing?"b":"w";
  let moves = generateLegalMoves(color);
  if(maximizing){
    let maxEval = -Infinity;
    for(let m of moves){
      const piece = board[m.r1][m.c1], cap = board[m.r2][m.c2];
      board[m.r2][m.c2]=piece; board[m.r1][m.c1]="";
      let evalScore = minimax(depth-1,alpha,beta,false);
      board[m.r1][m.c1]=piece; board[m.r2][m.c2]=cap;

      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if(beta<=alpha) break;
      if(stopSearch) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for(let m of moves){
      const piece = board[m.r1][m.c1], cap = board[m.r2][m.c2];
      board[m.r2][m.c2]=piece; board[m.r1][m.c1]="";
      let evalScore = minimax(depth-1,alpha,beta,true);
      board[m.r1][m.c1]=piece; board[m.r2][m.c2]=cap;

      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if(beta<=alpha) break;
      if(stopSearch) break;
    }
    return minEval;
  }
}

// --- Quiescence ---
function quiescence(alpha,beta,maximizing){
  let stand_pat = evaluateBoard();
  if(maximizing){
    if(stand_pat>=beta) return beta;
    alpha = Math.max(alpha, stand_pat);
  } else {
    if(stand_pat<=alpha) return alpha;
    beta = Math.min(beta, stand_pat);
  }

  let moves = generateCaptures(maximizing?"b":"w");
  for(let m of moves){
    const piece = board[m.r1][m.c1], cap = board[m.r2][m.c2];
    board[m.r2][m.c2]=piece; board[m.r1][m.c1]="";
    let score = quiescence(alpha,beta,!maximizing);
    board[m.r1][m.c1]=piece; board[m.r2][m.c2]=cap;

    if(maximizing){
      alpha = Math.max(alpha, score);
      if(beta<=alpha) break;
    } else {
      beta = Math.min(beta, score);
      if(beta<=alpha) break;
    }
  }
  return maximizing?alpha:beta;
}

// --- Evaluación avanzada ---
function evaluateBoard(){
  let score=0;
  const centerSquares = [[3,3],[3,4],[4,3],[4,4]];

  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      let p = board[r][c];
      if(!p) continue;
      let val = pieceValues[p.toLowerCase()] || 0;

      // Piezas blancas negativas, negras positivas
      score += p===p.toUpperCase()? -val : val;

      // Bonificación centro
      if(centerSquares.some(([cr,cc])=>cr===r && cc===c)) score += (p===p.toUpperCase()? -10 : 10);

      // Bonificación movilidad
      score += (generatePseudoMoves(p===p.toUpperCase()?"w":"b").filter(m=>m.r1===r && m.c1===c).length)*5;
    }
  }

  // Penalizar rey expuesto
  score += kingSafety("w") - kingSafety("b");

  return score;
}

// --- Seguridad del rey ---
function kingSafety(color){
  let kingPos=null;
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    let p=board[r][c];
    if((color==="w" && p==="K")||(color==="b" && p==="k")) kingPos={r,c};
  }
  if(!kingPos) return 0;

  let danger=0;
  const enemy = color==="w"?"b":"w";
  let threats = generatePseudoMoves(enemy).filter(m=>m.r2===kingPos.r && m.c2===kingPos.c);
  danger = threats.length * 50;
  return color==="w"? -danger : danger;
}

// --- Valor de pieza ---
function pieceValue(p){ return pieceValues[p.toLowerCase()]||0; }

// --- Movimientos legales ---
function generateLegalMoves(color){
  let moves=[];
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      let p = board[r][c]; if(!p) continue;
      if((color==="w" && p===p.toUpperCase())||(color==="b" && p===p.toLowerCase())){
        moves.push(...pieceMoves(r,c,p));
      }
    }
  }
  return moves.filter(m=>!leavesKingInCheck(m,color));
}

// --- Movimientos de captura ---
function generateCaptures(color){
  return generateLegalMoves(color).filter(m=>board[m.r2][m.c2]);
}

// --- Detecta jaque ---
function leavesKingInCheck(m,color){
  const piece = board[m.r1][m.c1], cap = board[m.r2][m.c2];
  board[m.r2][m.c2]=piece; board[m.r1][m.c1]="";
  let inCheck = kingInCheck(color);
  board[m.r1][m.c1]=piece; board[m.r2][m.c2]=cap;
  return inCheck;
}

function kingInCheck(color){
  let kingPos=null;
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    let p = board[r][c];
    if((color==="w" && p==="K")||(color==="b" && p==="k")) kingPos={r,c};
  }
  if(!kingPos) return false;
  const enemy = color==="w"?"b":"w";
  return generatePseudoMoves(enemy).some(m=>m.r2===kingPos.r && m.c2===kingPos.c);
}

function generatePseudoMoves(color){
  let moves=[];
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      let p=board[r][c]; if(!p) continue;
      if((color==="w"&&p===p.toUpperCase())||(color==="b"&&p===p.toLowerCase())){
        moves.push(...pieceMoves(r,c,p));
      }
    }
  }
  return moves;
}

// --- Movimiento de piezas ---
function pieceMoves(r,c,p){
  let moves=[], enemy = p===p.toUpperCase()?"b":"w";
  function add(r2,c2){
    if(r2<0||r2>7||c2<0||c2>7) return;
    let t=board[r2][c2];
    if(!t || (enemy==="b"&&t===t.toLowerCase())||(enemy==="w"&&t===t.toUpperCase()))
      moves.push({r1:r,c1:c,r2,c2});
  }
  function slideMoves(dirs){
    let res=[];
    for(let [dr,dc] of dirs){
      let nr=r+dr,nc=c+dc;
      while(nr>=0 && nr<8 && nc>=0 && nc<8){
        let t=board[nr][nc];
        if(!t) res.push({r1:r,c1:c,r2:nr,c2:nc});
        else { if((enemy==="b"&&t===t.toLowerCase())||(enemy==="w"&&t===t.toUpperCase())) res.push({r1:r,c1:c,r2:nr,c2:nc}); break; }
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
        let t = board[r+dir]?.[c+dc];
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
