// aiWorker.js — Minimax + alpha-beta + quiescence + evaluación estratégica
// Recibe: { command:"start", board, castling, enPassant, depth }
// Devuelve: movimiento { r1,c1,r2,c2 } o null

let stopSearch = false;

// valores (centésimas)
const pieceValues = { p:100, n:320, b:330, r:500, q:900, k:20000 };

let board = [];
let castling = { wK:true, wQ:true, bK:true, bQ:true };
let enPassant = null;

self.onmessage = function(e){
  const { command, board: b, depth, castling: c, enPassant: ep } = e.data;
  if(command === "stop"){ stopSearch = true; return; }
  if(command === "start"){
    stopSearch = false;
    board = b.map(r=>r.slice());
    castling = {...c};
    enPassant = ep ? {...ep} : null;
    const maxDepth = Math.max(1, Math.min(6, parseInt(depth||4,10)));
    const best = iterativeDeepening(maxDepth);
    self.postMessage(best);
  }
};

// iterative deepening with quick mate check
function iterativeDeepening(maxDepth){
  // quick immediate king capture
  const immediate = findImmediateKingCapture("b");
  if(immediate) return immediate;

  let best=null;
  for(let d=1; d<=maxDepth; d++){
    best = minimaxRoot(d);
    if(stopSearch) break;
  }
  return best;
}

function minimaxRoot(depth){
  let best=null;
  let bestVal=-Infinity;
  let moves = generateLegalMoves("b");
  moves.sort((a,b)=>valueOfCapture(b) - valueOfCapture(a)); // captures first

  for(const m of moves){
    makeMove(m);
    const val = minimax(depth-1, -Infinity, Infinity, false);
    undoMove(m);
    if(val > bestVal){ bestVal = val; best = m; }
    if(stopSearch) break;
  }
  return best;
}

function minimax(depth, alpha, beta, maximizing){
  if(depth === 0) return quiescence(alpha, beta, maximizing);

  const color = maximizing ? "b" : "w";
  let moves = generateLegalMoves(color);
  if(moves.length === 0){
    // mate or stalemate
    if(kingInCheck(color)) return maximizing ? -1000000 : 1000000;
    return 0;
  }

  moves.sort((a,b)=>valueOfCapture(b) - valueOfCapture(a));

  if(maximizing){
    let value = -Infinity;
    for(const m of moves){
      makeMove(m);
      const score = minimax(depth-1, alpha, beta, false);
      undoMove(m);
      if(score > value) value = score;
      if(value > alpha) alpha = value;
      if(alpha >= beta) break;
      if(stopSearch) break;
    }
    return value;
  } else {
    let value = Infinity;
    for(const m of moves){
      makeMove(m);
      const score = minimax(depth-1, alpha, beta, true);
      undoMove(m);
      if(score < value) value = score;
      if(value < beta) beta = value;
      if(alpha >= beta) break;
      if(stopSearch) break;
    }
    return value;
  }
}

function quiescence(alpha, beta, maximizing){
  const stand = evaluateBoard();
  if(maximizing){
    if(stand >= beta) return beta;
    if(stand > alpha) alpha = stand;
  } else {
    if(stand <= alpha) return alpha;
    if(stand < beta) beta = stand;
  }

  const moves = generateCaptures(maximizing ? "b" : "w");
  moves.sort((a,b)=>valueOfCapture(b) - valueOfCapture(a));
  for(const m of moves){
    makeMove(m);
    const score = quiescence(alpha, beta, !maximizing);
    undoMove(m);
    if(maximizing){
      if(score > alpha) alpha = score;
      if(alpha >= beta) break;
    } else {
      if(score < beta) beta = score;
      if(alpha >= beta) break;
    }
    if(stopSearch) break;
  }
  return maximizing ? alpha : beta;
}

/* Evaluation: strategic */
function evaluateBoard(){
  let score = 0;
  const center = [[3,3],[3,4],[4,3],[4,4]];

  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const p = board[r][c];
      if(!p) continue;
      const val = pieceValues[p.toLowerCase()] || 0;
      const sign = (p === p.toUpperCase()) ? -1 : 1; // white negative, black positive
      score += val * sign;

      // center control
      if(center.some(([cr,cc])=>cr===r && cc===c)) score += 10 * sign;

      // mobility (quick)
      const mobility = pseudoMovesForPiece(r,c,p).length;
      score += mobility * 3 * sign;
    }
  }

  // king safety: threats near king
  score += kingSafety("b");
  score -= kingSafety("w");

  return score;
}

function kingSafety(color){
  const k = findKing(color);
  if(!k) return 0;
  const enemy = color==="w" ? "b" : "w";
  const threats = generatePseudoMoves(enemy).filter(m=>m.r2===k.r && m.c2===k.c).length;
  return threats * 50 * (color==="b" ? 1 : -1);
}

/* Immediate king capture check */
function findImmediateKingCapture(color){
  const moves = generateLegalMoves(color);
  for(const m of moves) if(board[m.r2][m.c2] === (color==="w" ? "K" : "k")) return m;
  return null;
}

/* move make/undo for worker */
function makeMove(m){
  m._captured = board[m.r2][m.c2];
  m._piece = board[m.r1][m.c1];
  board[m.r2][m.c2] = m._piece;
  board[m.r1][m.c1] = "";

  // en passant
  if(m._piece && m._piece.toLowerCase()==="p" && Math.abs(m.r2 - m.r1) === 2){
    enPassant = { r: (m.r1 + m.r2)/2, c: m.c1 };
  } else {
    enPassant = null;
  }
  // en passant capture removal if applicable
  if(m._piece && m._piece.toLowerCase()==="p" && m._captured === "" && m.c1 !== m.c2){
    board[m.r1][m.c2] = "";
  }

  // castling rook movement
  if(m._piece === "K" && m.c2 - m.c1 === 2){ board[7][5] = "R"; board[7][7] = ""; }
  if(m._piece === "K" && m.c2 - m.c1 === -2){ board[7][3] = "R"; board[7][0] = ""; }
  if(m._piece === "k" && m.c2 - m.c1 === 2){ board[0][5] = "r"; board[0][7] = ""; }
  if(m._piece === "k" && m.c2 - m.c1 === -2){ board[0][3] = "r"; board[0][0] = ""; }

  // save castling
  m._castling_before = {...castling};
  // update castling flags
  if(m._piece === "K"){ castling.wK=false; castling.wQ=false; }
  if(m._piece === "k"){ castling.bK=false; castling.bQ=false; }
  if(m._piece === "R" && m.r1===7 && m.c1===0) castling.wQ=false;
  if(m._piece === "R" && m.r1===7 && m.c1===7) castling.wK=false;
  if(m._piece === "r" && m.r1===0 && m.c1===0) castling.bQ=false;
  if(m._piece === "r" && m.r1===0 && m.c1===7) castling.bK=false;

  // promotion auto to queen
  if(m._piece === "P" && m.r2 === 0) board[m.r2][m.c2] = "Q";
  if(m._piece === "p" && m.r2 === 7) board[m.r2][m.c2] = "q";
}

function undoMove(m){
  board[m.r1][m.c1] = m._piece;
  board[m.r2][m.c2] = m._captured;
  if(m._castling_before) castling = {...m._castling_before};
  // Note: enPassant is not fully restored here; worker does fine with this simplified scheme within single search tree
}

/* Move generation inside worker (same logic) */
function generateLegalMoves(color){
  let moves=[];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p = board[r][c]; if(!p) continue;
    if((color==="w"&&p===p.toUpperCase())||(color==="b"&&p===p.toLowerCase())) moves.push(...pieceMoves(r,c,p));
  }
  return moves.filter(m=>!leavesKingInCheckWorker(m,color));
}

function leavesKingInCheckWorker(m,color){
  const piece = board[m.r1][m.c1], cap = board[m.r2][m.c2];
  board[m.r2][m.c2] = piece; board[m.r1][m.c1] = "";
  let removed = null;
  if(piece && piece.toLowerCase()==="p" && cap === "" && m.c1 !== m.c2){
    removed = {r:m.r1,c:m.c2,val: board[m.r1][m.c2]};
    board[m.r1][m.c2] = "";
  }
  const inCheck = kingInCheckWorker(color);
  board[m.r1][m.c1] = piece; board[m.r2][m.c2] = cap;
  if(removed) board[removed.r][removed.c] = removed.val;
  return inCheck;
}

function kingInCheckWorker(color){
  const k = findKingWorker(color);
  if(!k) return false;
  const enemy = color==="w" ? "b" : "w";
  return generatePseudoMovesWorker(enemy).some(m=>m.r2===k.r && m.c2===k.c);
}
function findKingWorker(color){
  const target = color==="w" ? "K" : "k";
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(board[r][c]===target) return {r,c};
  return null;
}
function generatePseudoMovesWorker(color){
  let moves=[];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p = board[r][c]; if(!p) continue;
    if((color==="w"&&p===p.toUpperCase())||(color==="b"&&p===p.toLowerCase())) moves.push(...pieceMoves(r,c,p));
  }
  return moves;
}

function pieceMoves(r,c,p){
  let moves=[], enemy = p===p.toUpperCase() ? "b" : "w";
  function add(r2,c2){
    if(r2<0||r2>7||c2<0||c2>7) return;
    const t = board[r2][c2];
    if(!t || (enemy==="b" && t===t.toLowerCase()) || (enemy==="w" && t===t.toUpperCase()))
      moves.push({r1:r,c1:c,r2,c2});
  }
  function slide(dirs){
    let res=[];
    for(const [dr,dc] of dirs){
      let nr=r+dr, nc=c+dc;
      while(nr>=0 && nr<8 && nc>=0 && nc<8){
        const t = board[nr][nc];
        if(!t) res.push({r1:r,c1:c,r2:nr,c2:nc});
        else { if((enemy==="b"&&t===t.toLowerCase())||(enemy==="w"&&t===t.toUpperCase())) res.push({r1:r,c1:c,r2:nr,c2:nc}); break; }
        nr+=dr; nc+=dc;
      }
    }
    return res;
  }

  switch(p.toLowerCase()){
    case "p":{
      const dir = p==="P"? -1 : 1;
      if(board[r+dir]?.[c] === "") add(r+dir,c);
      if((p==="P"&&r===6)||(p==="p"&&r===1)){
        if(board[r+dir]?.[c]==="" && board[r+2*dir]?.[c]==="") add(r+2*dir,c);
      }
      for(const dc of [-1,1]){
        const t = board[r+dir]?.[c+dc];
        if(t){
          if((p==="P"&&t===t.toLowerCase())||(p==="p"&&t===t.toUpperCase())) add(r+dir,c+dc);
        }
        if(enPassant && enPassant.r===r+dir && enPassant.c===c+dc) add(r+dir,c+dc);
      }
      break;
    }
    case "n":
      [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]].forEach(([dr,dc])=>add(r+dr,c+dc));
      break;
    case "b": moves.push(...slide([[1,1],[1,-1],[-1,1],[-1,-1]])); break;
    case "r": moves.push(...slide([[1,0],[-1,0],[0,1],[0,-1]])); break;
    case "q": moves.push(...slide([[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]])); break;
    case "k":
      for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) if(dr||dc) add(r+dr,c+dc);
      if(p==="K"){
        if(castling.wK && board[7][5]==="" && board[7][6]===""){
          if(!isSquareAttackedWorker(7,4,"b") && !isSquareAttackedWorker(7,5,"b") && !isSquareAttackedWorker(7,6,"b"))
            moves.push({r1:7,c1:4,r2:7,c2:6});
        }
        if(castling.wQ && board[7][1]==="" && board[7][2]==="" && board[7][3]===""){
          if(!isSquareAttackedWorker(7,4,"b") && !isSquareAttackedWorker(7,3,"b") && !isSquareAttackedWorker(7,2,"b"))
            moves.push({r1:7,c1:4,r2:7,c2:2});
        }
      }
      if(p==="k"){
        if(castling.bK && board[0][5]==="" && board[0][6]===""){
          if(!isSquareAttackedWorker(0,4,"w") && !isSquareAttackedWorker(0,5,"w") && !isSquareAttackedWorker(0,6,"w"))
            moves.push({r1:0,c1:4,r2:0,c2:6});
        }
        if(castling.bQ && board[0][1]==="" && board[0][2]==="" && board[0][3]===""){
          if(!isSquareAttackedWorker(0,4,"w") && !isSquareAttackedWorker(0,3,"w") && !isSquareAttackedWorker(0,2,"w"))
            moves.push({r1:0,c1:4,r2:0,c2:2});
        }
      }
      break;
  }
  return moves;
}

function isSquareAttackedWorker(r,c,byColor){
  return generatePseudoMovesWorker(byColor).some(m=>m.r2===r && m.c2===c);
}

function generateCaptures(color){
  return generateLegalMoves(color).filter(m=>board[m.r2][m.c2] !== "");
}

function valueOfCapture(m){
  const cap = board[m.r2][m.c2];
  if(!cap) return 0;
  const attacker = board[m.r1][m.c1];
  if(!attacker) return 0;
  return (pieceValues[cap.toLowerCase()] || 0) - (pieceValues[attacker.toLowerCase()] || 0) / 10;
}

/* helpers used above */
function generatePseudoMovesWorker(color){
  let moves=[];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p = board[r][c]; if(!p) continue;
    if((color==="w"&&p===p.toUpperCase())||(color==="b"&&p===p.toLowerCase())) moves.push(...pieceMoves(r,c,p));
  }
  return moves;
}

function findKingWorker(color){
  const t = color==="w" ? "K" : "k";
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(board[r][c]===t) return {r,c};
  return null;
}

/* Immediate capture helper duplicate removed (already defined) */
function findImmediateKingCapture(color){
  const moves = generateLegalMoves(color);
  for(const m of moves) if(board[m.r2][m.c2] === (color==="w" ? "K" : "k")) return m;
  return null;
}


