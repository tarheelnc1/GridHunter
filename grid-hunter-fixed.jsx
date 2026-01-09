const { useState, useEffect } = React;
const { initializeApp } = window;

// REPLACE THIS WITH YOUR FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyBxyz123example",
  authDomain: "battleship-game.firebaseapp.com",
  databaseURL: "https://battleship-game-default-rtdb.firebaseio.com",
  projectId: "battleship-game",
  storageBucket: "battleship-game.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

const BattleshipGame = () => {
  const [app] = useState(() => firebase.initializeApp(firebaseConfig));
  const [db] = useState(() => firebase.database());
  const [gameId, setGameId] = useState('');
  const [playerId] = useState(() => Math.random().toString(36).substr(2, 9) + Date.now());
  const [gameState, setGameState] = useState(null);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [screen, setScreen] = useState('menu');
  const [playerName, setPlayerName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const GRID_SIZE = 6;

  useEffect(() => {
    if (gameId) {
      const gameRef = db.ref(`games/${gameId}`);
      const unsubscribe = gameRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setGameState(data);
          
          if (data.phase === 'setup' && screen !== 'setup') {
            setScreen('setup');
          } else if (data.phase === 'battle' && screen !== 'battle') {
            setScreen('battle');
          } else if (data.phase === 'finished' && screen !== 'winner') {
            setScreen('winner');
          }
        } else {
          setScreen('menu');
          setGameId('');
        }
      });
      return () => gameRef.off('value', unsubscribe);
    }
  }, [gameId, db, screen]);

  const createGame = async () => {
    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }
    
    const newGameRef = db.ref('games').push();
    const newGameId = newGameRef.key;
    const gameCode = Math.random().toString(36).substr(2, 6).toUpperCase();
    
    await newGameRef.set({
      code: gameCode,
      host: playerId,
      players: {
        [playerId]: {
          name: playerName,
          ready: false,
          square: null
        }
      },
      phase: 'lobby',
      currentTurn: null,
      guesses: {},
      winner: null,
      createdAt: Date.now()
    });
    
    setGameId(newGameId);
    setScreen('lobby');
  };

  const joinGame = async () => {
    console.log('JOIN GAME CLICKED');
    
    if (!playerName.trim() || !joinCode.trim()) {
      alert('Please enter your name and game code');
      return;
    }
    
    console.log('Searching for game with code:', joinCode.toUpperCase());
    
    try {
      const gamesRef = db.ref('games');
      const snapshot = await gamesRef.once('value');
      const games = snapshot.val();
      
      console.log('Games found:', games);
      
      if (games) {
        const foundGame = Object.entries(games).find(([id, game]) => 
          game.code === joinCode.toUpperCase()
        );
        
        console.log('Found game:', foundGame);
        
        if (foundGame) {
          const [foundGameId, foundGameData] = foundGame;
          
          if (Object.keys(foundGameData.players || {}).length >= 2) {
            alert('Game is full');
            return;
          }
          
          console.log('Joining game:', foundGameId);
          
          await db.ref(`games/${foundGameId}/players/${playerId}`).set({
            name: playerName,
            ready: false,
            square: null
          });
          
          console.log('Successfully joined!');
          setGameId(foundGameId);
          setScreen('lobby');
        } else {
          alert('Game not found - check code: ' + joinCode.toUpperCase());
        }
      } else {
        alert('No games found in database');
      }
    } catch (error) {
      console.error('Error joining game:', error);
      alert('Error joining game: ' + error.message);
    }
  };

  const startGame = async () => {
    if (!gameState || Object.keys(gameState.players).length < 2) {
      alert('Waiting for another player');
      return;
    }
    
    await db.ref(`games/${gameId}`).update({
      phase: 'setup'
    });
  };

  const selectSquare = async (row, col) => {
    if (selectedSquare) return;
    
    setSelectedSquare({ row, col });
    
    await db.ref(`games/${gameId}/players/${playerId}`).update({
      square: { row, col },
      ready: true
    });
  };

  useEffect(() => {
    if (gameState?.phase === 'setup' && gameState.players) {
      const players = Object.values(gameState.players);
      if (players.length === 2 && players.every(p => p.ready)) {
        const playerIds = Object.keys(gameState.players);
        const firstPlayer = playerIds[Math.floor(Math.random() * playerIds.length)];
        
        db.ref(`games/${gameId}`).update({
          phase: 'battle',
          currentTurn: firstPlayer
        });
      }
    }
  }, [gameState, gameId, db]);

  const makeGuess = async (row, col) => {
    if (gameState.currentTurn !== playerId) return;
    
    const guessKey = `${playerId}-${row}-${col}`;
    if (gameState.guesses?.[guessKey]) return;
    
    const opponentId = Object.keys(gameState.players).find(id => id !== playerId);
    const opponentSquare = gameState.players[opponentId].square;
    
    const isHit = opponentSquare.row === row && opponentSquare.col === col;
    
    await db.ref(`games/${gameId}/guesses/${guessKey}`).update({
      player: playerId,
      row,
      col,
      hit: isHit,
      timestamp: Date.now()
    });
    
    if (isHit) {
      await db.ref(`games/${gameId}`).update({
        phase: 'finished',
        winner: playerId
      });
    } else {
      await db.ref(`games/${gameId}`).update({
        currentTurn: opponentId
      });
    }
  };

  const playAgain = async () => {
    try {
      console.log('Play again clicked');
      
      // Remove guesses completely instead of setting to empty object
      await db.ref(`games/${gameId}/guesses`).remove();
      
      // Reset game state
      await db.ref(`games/${gameId}`).update({
        phase: 'setup',
        currentTurn: null,
        winner: null
      });
      
      // Reset all players
      const players = Object.keys(gameState.players);
      for (const pid of players) {
        await db.ref(`games/${gameId}/players/${pid}`).update({
          ready: false,
          square: null
        });
      }
      
      // Reset local state
      setSelectedSquare(null);
      setScreen('setup');
      
      console.log('Game reset complete');
    } catch (error) {
      console.error('Error in playAgain:', error);
      alert('Error resetting game: ' + error.message);
    }
  };

  const leaveGame = async () => {
    if (gameId) {
      await db.ref(`games/${gameId}`).remove();
    }
    setGameId('');
    setGameState(null);
    setSelectedSquare(null);
    setScreen('menu');
  };

  const renderGrid = (onSquareClick, showOpponentSquare = false) => {
    const myGuesses = gameState?.guesses ? 
      Object.values(gameState.guesses).filter(g => g.player === playerId) : [];
    const opponentId = gameState?.players ? 
      Object.keys(gameState.players).find(id => id !== playerId) : null;
    const opponentSquare = opponentId ? gameState.players[opponentId].square : null;

    return (
      <div className="grid">
        {[...Array(GRID_SIZE)].map((_, row) => (
          <div key={row} className="grid-row">
            {[...Array(GRID_SIZE)].map((_, col) => {
              const isMySquare = selectedSquare?.row === row && selectedSquare?.col === col;
              const guess = myGuesses.find(g => g.row === row && g.col === col);
              const isOpponentSquare = showOpponentSquare && opponentSquare?.row === row && opponentSquare?.col === col;
              
              let className = 'grid-square';
              if (isMySquare) className += ' my-square';
              if (guess?.hit) className += ' hit';
              if (guess && !guess.hit) className += ' miss';
              if (isOpponentSquare) className += ' opponent-square';
              
              return (
                <button
                  key={`${row}-${col}`}
                  className={className}
                  onClick={() => onSquareClick?.(row, col)}
                  disabled={!onSquareClick}
                >
                  {isMySquare && <div className="submarine-icon">🎯</div>}
                  {guess?.hit && <div className="explosion">💥</div>}
                  {guess && !guess.hit && <div className="ripple">〰️</div>}
                  {isOpponentSquare && <div className="submarine-icon">🎯</div>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="game-container">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          overflow-x: hidden;
        }
        
        .game-container {
          min-height: 100vh;
          background: #0a0e27;
          background-image: 
            radial-gradient(circle at 20% 50%, rgba(0, 255, 157, 0.03) 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, rgba(0, 194, 255, 0.03) 0%, transparent 50%);
          color: #00ff9d;
          font-family: 'Share Tech Mono', monospace;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          position: relative;
          overflow: hidden;
        }
        
        .game-container::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: 
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              rgba(0, 255, 157, 0.03) 2px,
              rgba(0, 255, 157, 0.03) 4px
            );
          pointer-events: none;
          animation: scanlines 8s linear infinite;
        }
        
        @keyframes scanlines {
          0% { transform: translateY(0); }
          100% { transform: translateY(10px); }
        }
        
        .screen {
          background: rgba(10, 14, 39, 0.95);
          border: 3px solid #00ff9d;
          border-radius: 20px;
          padding: 40px;
          max-width: 600px;
          width: 100%;
          box-shadow: 
            0 0 20px rgba(0, 255, 157, 0.3),
            inset 0 0 20px rgba(0, 255, 157, 0.05);
          position: relative;
          z-index: 1;
          animation: screenGlow 2s ease-in-out infinite alternate;
        }
        
        @keyframes screenGlow {
          from { box-shadow: 0 0 20px rgba(0, 255, 157, 0.3), inset 0 0 20px rgba(0, 255, 157, 0.05); }
          to { box-shadow: 0 0 30px rgba(0, 255, 157, 0.5), inset 0 0 30px rgba(0, 255, 157, 0.1); }
        }
        
        h1 {
          font-family: 'Orbitron', sans-serif;
          font-weight: 900;
          font-size: 2.5em;
          text-align: center;
          margin-bottom: 10px;
          text-transform: uppercase;
          letter-spacing: 4px;
          text-shadow: 
            0 0 10px #00ff9d,
            0 0 20px #00ff9d,
            0 0 30px #00ff9d;
          animation: titlePulse 3s ease-in-out infinite;
        }
        
        @keyframes titlePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        
        h2 {
          font-family: 'Orbitron', sans-serif;
          font-weight: 700;
          font-size: 1.5em;
          text-align: center;
          margin-bottom: 20px;
          color: #00c2ff;
          text-shadow: 0 0 10px #00c2ff;
        }
        
        .subtitle {
          text-align: center;
          color: #00c2ff;
          margin-bottom: 30px;
          font-size: 0.9em;
          letter-spacing: 2px;
        }
        
        .input-group {
          margin-bottom: 20px;
        }
        
        label {
          display: block;
          margin-bottom: 8px;
          color: #00ff9d;
          font-size: 0.9em;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        
        input {
          width: 100%;
          padding: 12px 16px;
          background: rgba(0, 255, 157, 0.1);
          border: 2px solid #00ff9d;
          border-radius: 8px;
          color: #00ff9d;
          font-family: 'Share Tech Mono', monospace;
          font-size: 1em;
          transition: all 0.3s ease;
        }
        
        input:focus {
          outline: none;
          background: rgba(0, 255, 157, 0.15);
          box-shadow: 0 0 15px rgba(0, 255, 157, 0.3);
        }
        
        input::placeholder {
          color: rgba(0, 255, 157, 0.4);
        }
        
        button {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, #00ff9d 0%, #00c2ff 100%);
          border: none;
          border-radius: 8px;
          color: #0a0e27;
          font-family: 'Orbitron', sans-serif;
          font-weight: 700;
          font-size: 1em;
          text-transform: uppercase;
          letter-spacing: 2px;
          cursor: pointer;
          transition: all 0.3s ease;
          margin-bottom: 10px;
          box-shadow: 0 4px 15px rgba(0, 255, 157, 0.3);
        }
        
        button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 255, 157, 0.5);
        }
        
        button:active:not(:disabled) {
          transform: translateY(0);
        }
        
        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        button.secondary {
          background: transparent;
          border: 2px solid #00ff9d;
          color: #00ff9d;
        }
        
        button.secondary:hover:not(:disabled) {
          background: rgba(0, 255, 157, 0.1);
        }
        
        .game-code {
          background: rgba(0, 194, 255, 0.2);
          border: 2px solid #00c2ff;
          border-radius: 12px;
          padding: 20px;
          text-align: center;
          margin: 20px 0;
        }
        
        .game-code label {
          color: #00c2ff;
          font-size: 0.8em;
          margin-bottom: 10px;
        }
        
        .code-display {
          font-family: 'Orbitron', sans-serif;
          font-size: 2em;
          font-weight: 900;
          letter-spacing: 8px;
          color: #00c2ff;
          text-shadow: 0 0 15px #00c2ff;
        }
        
        .player-list {
          margin: 20px 0;
        }
        
        .player-item {
          background: rgba(0, 255, 157, 0.1);
          border: 1px solid #00ff9d;
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        
        .player-name {
          font-weight: bold;
        }
        
        .status {
          font-size: 0.8em;
          color: #00c2ff;
        }
        
        .grid {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin: 30px 0;
          padding: 20px;
          background: rgba(0, 255, 157, 0.05);
          border: 2px solid #00ff9d;
          border-radius: 12px;
          box-shadow: inset 0 0 20px rgba(0, 255, 157, 0.1);
        }
        
        .grid-row {
          display: flex;
          gap: 8px;
          justify-content: center;
        }
        
        .grid-square {
          width: 60px;
          height: 60px;
          background: rgba(0, 194, 255, 0.1);
          border: 2px solid #00c2ff;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5em;
        }
        
        .grid-square:hover:not(:disabled) {
          background: rgba(0, 194, 255, 0.2);
          transform: scale(1.05);
          box-shadow: 0 0 15px rgba(0, 194, 255, 0.5);
        }
        
        .grid-square.my-square {
          background: rgba(0, 255, 157, 0.3);
          border-color: #00ff9d;
          box-shadow: 0 0 20px rgba(0, 255, 157, 0.6);
        }
        
        .grid-square.hit {
          background: rgba(255, 0, 100, 0.3);
          border-color: #ff0064;
          box-shadow: 0 0 20px rgba(255, 0, 100, 0.8);
          animation: hitFlash 0.5s ease;
        }
        
        @keyframes hitFlash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        .grid-square.miss {
          background: rgba(100, 100, 100, 0.2);
          border-color: #666;
          opacity: 0.6;
        }
        
        .grid-square.opponent-square {
          background: rgba(255, 0, 100, 0.3);
          border-color: #ff0064;
          box-shadow: 0 0 20px rgba(255, 0, 100, 0.6);
        }
        
        .submarine-icon, .explosion, .ripple {
          animation: iconPop 0.3s ease;
        }
        
        @keyframes iconPop {
          0% { transform: scale(0); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        
        .turn-indicator {
          text-align: center;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
          font-family: 'Orbitron', sans-serif;
          font-weight: 700;
          letter-spacing: 2px;
          text-transform: uppercase;
        }
        
        .turn-indicator.my-turn {
          background: rgba(0, 255, 157, 0.2);
          border: 2px solid #00ff9d;
          color: #00ff9d;
          animation: pulseBorder 1.5s ease-in-out infinite;
        }
        
        @keyframes pulseBorder {
          0%, 100% { border-color: #00ff9d; box-shadow: 0 0 10px rgba(0, 255, 157, 0.5); }
          50% { border-color: #00c2ff; box-shadow: 0 0 20px rgba(0, 194, 255, 0.8); }
        }
        
        .turn-indicator.opponent-turn {
          background: rgba(0, 194, 255, 0.1);
          border: 2px solid #00c2ff;
          color: #00c2ff;
        }
        
        .winner-message {
          text-align: center;
          padding: 30px;
          margin: 20px 0;
          background: linear-gradient(135deg, rgba(0, 255, 157, 0.2) 0%, rgba(0, 194, 255, 0.2) 100%);
          border: 3px solid #00ff9d;
          border-radius: 12px;
          font-family: 'Orbitron', sans-serif;
          font-size: 1.5em;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 3px;
          animation: winnerGlow 1s ease-in-out infinite alternate;
        }
        
        @keyframes winnerGlow {
          from { box-shadow: 0 0 20px rgba(0, 255, 157, 0.5); }
          to { box-shadow: 0 0 40px rgba(0, 255, 157, 0.8); }
        }
        
        .info-text {
          text-align: center;
          color: #00c2ff;
          margin: 15px 0;
          font-size: 0.9em;
        }
        
        @media (max-width: 600px) {
          .screen {
            padding: 20px;
          }
          
          h1 {
            font-size: 1.8em;
          }
          
          .grid-square {
            width: 45px;
            height: 45px;
            font-size: 1.2em;
          }
          
          .code-display {
            font-size: 1.5em;
            letter-spacing: 4px;
          }
        }
      `}</style>

      {screen === 'menu' && (
        <div className="screen">
          <h1>🎯 GRID HUNTER</h1>
          <p className="subtitle">Find Your Enemy's Position</p>
          
          <div className="input-group">
            <label>Commander Name</label>
            <input
              type="text"
              placeholder="Enter your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && createGame()}
            />
          </div>
          
          <button onClick={createGame}>Create New Game</button>
          
          <div style={{margin: '20px 0', textAlign: 'center', color: '#00c2ff'}}>
            — OR —
          </div>
          
          <div className="input-group">
            <label>Game Code</label>
            <input
              type="text"
              placeholder="Enter code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyPress={(e) => e.key === 'Enter' && joinGame()}
            />
          </div>
          
          <button onClick={joinGame}>Join Game</button>
        </div>
      )}

      {screen === 'lobby' && (
        <div className="screen">
          <h1>🎯 GRID HUNTER</h1>
          <h2>Waiting Room</h2>
          
          <div className="game-code">
            <label>Share this code with your opponent:</label>
            <div className="code-display">{gameState?.code}</div>
          </div>
          
          <div className="player-list">
            <label>Players ({Object.keys(gameState?.players || {}).length}/2)</label>
            {Object.entries(gameState?.players || {}).map(([id, player]) => (
              <div key={id} className="player-item">
                <span className="player-name">{player.name}</span>
                <span className="status">{id === playerId ? '(You)' : ''}</span>
              </div>
            ))}
          </div>
          
          {gameState?.host === playerId && (
            <button 
              onClick={startGame}
              disabled={Object.keys(gameState?.players || {}).length < 2}
            >
              Start Game
            </button>
          )}
          
          {gameState?.host !== playerId && Object.keys(gameState?.players || {}).length >= 2 && (
            <p className="info-text">Waiting for host to start the game...</p>
          )}
          
          {Object.keys(gameState?.players || {}).length < 2 && (
            <p className="info-text">Waiting for another player to join...</p>
          )}
          
          <button className="secondary" onClick={leaveGame}>
            Leave Game
          </button>
        </div>
      )}

      {screen === 'setup' && (
        <div className="screen">
          <h1>🎯 GRID HUNTER</h1>
          <h2>Deploy Your Position</h2>
          
          <p className="info-text">
            {selectedSquare 
              ? '✓ Position locked. Waiting for opponent...'
              : 'Select one square to hide your position'}
          </p>
          
          {renderGrid(
            !selectedSquare ? selectSquare : null
          )}
          
          <button className="secondary" onClick={leaveGame}>
            Leave Game
          </button>
        </div>
      )}

      {screen === 'battle' && (
        <div className="screen">
          <h1>🎯 GRID HUNTER</h1>
          
          <div className={`turn-indicator ${gameState?.currentTurn === playerId ? 'my-turn' : 'opponent-turn'}`}>
            {gameState?.currentTurn === playerId ? '🎯 YOUR TURN - Fire!' : '⏳ Opponent\'s Turn'}
          </div>
          
          {renderGrid(
            gameState?.currentTurn === playerId ? makeGuess : null
          )}
          
          <p className="info-text">
            Your position: {String.fromCharCode(65 + selectedSquare?.col)}{selectedSquare?.row + 1}
          </p>
          
          <button className="secondary" onClick={leaveGame}>
            Leave Game
          </button>
        </div>
      )}

      {screen === 'winner' && (
        <div className="screen">
          <h1>🎯 GRID HUNTER</h1>
          
          <div className="winner-message">
            {gameState?.winner === playerId ? '🎉 VICTORY!' : '💥 DEFEATED'}
          </div>
          
          <p className="info-text">
            {gameState?.winner === playerId 
              ? 'You successfully located the enemy position!'
              : 'Your position was discovered!'}
          </p>
          
          {renderGrid(null, true)}
          
          <button onClick={playAgain}>Play Again</button>
          <button className="secondary" onClick={leaveGame}>
            Leave Game
          </button>
        </div>
      )}
    </div>
  );
};

// Render the app
ReactDOM.render(<BattleshipGame />, document.getElementById('root'));
