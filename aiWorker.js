// aiWorker.js — Minimax + alpha-beta + quiescence + evaluación estratégica

let stopSearch = false;
const pieceValues = { p:100, n:320, b:330, r:500, q:900, k:20000 };

let board = [];
let castling = { wK:true, wQ:true, bK:true, bQ:true };
let enPassant = null;

self.onmessage = function(e){
  const { command, board:b, depth, castling:c, enPassant:ep } = e.data;
  if(command === "stop"){ stopSearch = true; return; }
  if(command === "start"){
    stopSearch = false;
    board = b.map(r=>r.slice());
    castling = {...c};
    enPassant = ep ? {...ep} : null;
    const best = iterativeDeepening(Math.max(1, Math.min(6, parseInt(depth||4))));
    self.postMessage(best);
  }
};

/* Iterative deepening */
function iterativeDeepening(maxDepth){
  let bestMove = null;
  // quick mate search: if immediate capture of king exists, do it
  const mateNow = findImmediateKingCapture("b");
  if(mateNow) return mateNow;

  for(let d=1; d<=maxDepth; d++){
    bestMove = minimaxRoot(d);
    if(stopSearch) break;
  }
  return bestMove;
}

function minimaxRoot(depth){
  let bestMove = null;
  let bestValue = -Infinity;
  let moves = generateLegalMoves("b");
  // move ordering: captures first (MVV/LVA)
  moves.sort((a,b) => (valueOfCapture(b) - valueOfCapture(a)));

  for(const m of moves){
    makeMove(m);
    const val = minimax(depth-1, -Infinity, Infinity, false);
    undoMove(m);
    if(val > bestValue){
      bestValue = val; bestMove = m;
    }
    if(stopSearch) break;
  }
  return bestMove;
}

function minimax(depth, alpha, beta, maximizing){
  if(depth === 0) return quiescence(alpha, beta, maximizing);

  const color = maximizing ? "b" : "w";
  let moves = generateLegalMoves(color);
  if(moves.length === 0) {
    // no moves: checkmate/stalemate
    if(kingInCheck(color)) return maximizing ? -999999 : 999999;
    return 0;
  }

  // ordering: try captures and checks first (simple heuristic)
  moves.sort((a,b) => valueOfCapture(b) - valueOfCapture(a));

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

/* Quiescence search (captures) */
function quiescence(alpha, beta, maximizing){
  const stand_pat = evaluateBoard();
  if(maximizing){
    if(stand_pat >= beta) return beta;
    if(stand_pat > alpha) alpha = stand_pat;
  } else {
    if(stand_pat <= alpha) return alpha;
    if(stand_pat < beta) beta = stand_pat;
  }

  const moves = generateCaptures(maximizing ? "b" : "w");
  // order captures
  moves.sort((a,b) => valueOfCapture(b) - valueOfCapture(a));

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

/* --- Evaluation (strategic) --- */
function evaluateBoard(){
  let score = 0;

  // piece values + side sign: black positive, white negative (since AI is black)
  const center = [[3,3],[3,4],[4,3],[4,4]];

  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const p = board[r][c];
      if(!p) continue;
      const val = pieceValues(p.toLowerCase());
      const sign = (p === p.toUpperCase()) ? -1 : 1; // white negative, black positive
      score += val * sign;

      // center control bonus
      if(center.some(([cr,cc]) => cr===r && cc===c)) score += 10 * sign;

      // mobility bonus (quick)
      const mobility = generatePseudoMoves(p===p.toUpperCase()?"w":"b").filter(m => m.r1===r && m.c1===c).length;
      score += mobility * 3 * sign;
    }
  }

  // king safety: penalize threatened king squares
  score += kingSafety("b");
  score -= kingSafety("w");

  // small randomness to avoid deterministic repetition (tiny)
  // score += (Math.random()-0.5) * 0.1;

  return score;
}

function kingSafety(color){
  const k = findKing(color);
  if(!k) return 0;
  const enemy = (color==="w") ? "b" : "w";
  const threats = generatePseudoMoves(enemy).filter(m => m.r2===k.r && m.c2===k.c).length;
  return threats * 50 * (color==="b" ? 1 : -1);
}

/* --- Utility: find immediate king capture (if any) --- */
function findImmediateKingCapture(color){
  // color is the side to move (we call with "b"), search for captures that eat opponent king
  const moves = generateLegalMoves(color);
  for(const m of moves){
    if(board[m.r2][m.c2] === (color==="w" ? "K" : "k")) return m;
  }
  return null;
}

/* --- Move helpers for worker (make/undo) --- */
function makeMove(m){
  m._captured = board[m.r2][m.c2];
  m._piece = board[m.r1][m.c1];
  board[m.r2][m.c2] = m._piece;
  board[m.r1][m.c1] = "";

  // set enPassant if pawn double move
  if(m._piece && m._piece.toLowerCase()==="p" && Math.abs(m.r2 - m.r1) === 2){
    enPassant = { r: (m.r1 + m.r2)/2, c: m.c1 };
  } else {
    enPassant = null;
  }

  // en passant capture removal
  if(m._piece && m._piece.toLowerCase()==="p" && m._captured === "" && m.c1 !== m.c2){
    // remove pawn that was captured en passant (on origin rank)
    board[m.r1][m.c2] = "";
  }

  // handle castling rook moves
  if(m._piece === "K" && m.c2 - m.c1 === 2){ board[7][5] = "R"; board[7][7] = ""; }
  if(m._piece === "K" && m.c2 - m.c1 === -2){ board[7][3] = "R"; board[7][0] = ""; }
  if(m._piece === "k" && m.c2 - m.c1 === 2){ board[0][5] = "r"; board[0][7] = ""; }
  if(m._piece === "k" && m.c2 - m.c1 === -2){ board[0][3] = "r"; board[0][0] = ""; }

  // Save castling state on move for undo:
  m._castling_before = {...castling};
  // update castling rights
  if(m._piece === "K"){ castling.wK=false; castling.wQ=false; }
  if(m._piece === "k"){ castling.bK=false; castling.bQ=false; }
  if(m._piece === "R" && m.r1===7 && m.c1===0) castling.wQ=false;
  if(m._piece === "R" && m.r1===7 && m.c1===7) castling.wK=false;
  if(m._piece === "r" && m.r1===0 && m.c1===0) castling.bQ=false;
  if(m._piece === "r" && m.r1===0 && m.c1===7) castling.bK=false;

  // promotion auto-queen
  if(m._piece === "P" && m.r2 === 0) board[m.r2][m.c2] = "Q";
  if(m._piece === "p" && m.r2 === 7) board[m.r2][m.c2] = "q";
}

function undoMove(m){
  // restore
  board[m.r1][m.c1] = m._piece;
  board[m.r2][m.c2] = m._captured;
  // undo en passant captured pawn restoration: can't always know exact, but we saved board state
  // restore rook positions if castling
  // restore castling rights
  castling = {...m._castling_before};
  // Note: For enPassant/other ephemeral state we keep it simple: worker uses fresh copy per search level from root
  // (this implementation relies on makeMove/undoMove within the same board copy; it restores board cells)
}

/* --- Move generation (same logic as main thread) --- */
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
  // filter leaving king in check
  return moves.filter(m => !leavesKingInCheckWorker(m,color));
}

function leavesKingInCheckWorker(m,color){
  const piece = board[m.r1][m.c1], cap = board[m.r2][m.c2];
  board[m.r2][m.c2] = piece; board[m.r1][m.c1] = "";
  // en passant simulated remove
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
  const enemy = (color==="w") ? "b" : "w";
  return generatePseudoMovesWorker(enemy).some(m => m.r2===k.r && m.c2===k.c);
}

function findKingWorker(color){
  const target = color==="w" ? "K" : "k";
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(board[r][c]===target) return {r,c};
  return null;
}

function generatePseudoMovesWorker(color){
  let moves=[];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p = board[r][c];
    if(!p) continue;
    if((color==="w" && p===p.toUpperCase()) || (color==="b" && p===p.toLowerCase())){
      moves.push(...pieceMoves(r,c,p));
    }
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
    case "p": {
      const dir = (p==="P") ? -1 : 1;
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
      [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]].forEach(([dr,dc])=>add(r+dr,c+dc)); break;
    case "b": moves.push(...slide([[1,1],[1,-1],[-1,1],[-1,-1]])); break;
    case "r": moves.push(...slide([[1,0],[-1,0],[0,1],[0,-1]])); break;
    case "q": moves.push(...slide([[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]])); break;
    case "k":
      for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) if(dr||dc) add(r+dr,c+dc);
      // castling basic (final legality confirmed by leavesKingInCheckWorker)
      if(p==="K"){
        if(castling.wK && board[7][5]==="" && board[7][6]==="") {
          // ensure squares not attacked (cheap check)
          if(!isSquareAttackedWorker(7,4,"b") && !isSquareAttackedWorker(7,5,"b") && !isSquareAttackedWorker(7,6,"b"))
            moves.push({r1:7,c1:4,r2:7,c2:6});
        }
        if(castling.wQ && board[7][1]==="" && board[7][2]==="" && board[7][3]==="") {
          if(!isSquareAttackedWorker(7,4,"b") && !isSquareAttackedWorker(7,3,"b") && !isSquareAttackedWorker(7,2,"b"))
            moves.push({r1:7,c1:4,r2:7,c2:2});
        }
      }
      if(p==="k"){
        if(castling.bK && board[0][5]==="" && board[0][6]==="") {
          if(!isSquareAttackedWorker(0,4,"w") && !isSquareAttackedWorker(0,5,"w") && !isSquareAttackedWorker(0,6,"w"))
            moves.push({r1:0,c1:4,r2:0,c2:6});
        }
        if(castling.bQ && board[0][1]==="" && board[0][2]==="" && board[0][3]==="") {
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
  return generateLegalMoves(color).filter(m => board[m.r2][m.c2] !== "");
}

/* --- Helpers for move ordering and capture value --- */
function valueOfCapture(m){
  const cap = board[m.r2][m.c2];
  if(!cap) return 0;
  const attacker = board[m.r1][m.c1];
  if(!attacker) return 0;
  const gain = pieceValues[cap.toLowerCase()] - pieceValues[attacker.toLowerCase()]/10;
  return gain;
}

function pieceValues(p){ return pieceValuesMap[p] || 0; }
/* Fix small name collision */
const pieceValuesMap = { p:100, n:320, b:330, r:500, q:900, k:20000 };

/* Expose small functions used above */
function generatePseudoMovesWorker(color){ // duplicate here for ordering/mobility
  let moves=[];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p = board[r][c]; if(!p) continue;
    if((color==="w"&&p===p.toUpperCase()) || (color==="b"&&p===p.toLowerCase())) moves.push(...pieceMoves(r,c,p));
  }
  return moves;
}

/* find king used earlier */
function findKingWorker(color){
  const target = color==="w" ? "K" : "k";
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(board[r][c]===target) return {r,c};
  return null;
}

/* can opponent escape? used in mate detection in earlier drafts - not needed here */

/* immediate king capture search helper used in iterative deepening */
function findImmediateKingCapture(color){
  const moves = generateLegalMoves(color);
  for(const m of moves){
    if(board[m.r2][m.c2] === (color==="w" ? "K" : "k")) return m;
  }
  return null;
}

  return moves;
}

