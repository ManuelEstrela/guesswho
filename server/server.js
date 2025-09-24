const express = require('express');
const http = require('http');
const { nanoid } = require('nanoid');
const cors = require('cors');

// Import the characters list to match with client - UPDATED WITH CORRECT CHARACTERS
const CHARACTERS = [
  { id: 'c1', name: 'Chatterbox', image: 'chatterbox.png' },
  { id: 'c2', name: 'Twinkles', image: 'twinkles.png' },
  { id: 'c3', name: 'Mr. Ratchet', image: 'mrratchet.png' },
  { id: 'c4', name: 'Tessa', image: 'tessa.png' },
  { id: 'c5', name: 'Kirk', image: 'kirk.png' },
  { id: 'c6', name: 'Bozo', image: 'bozo.png' },
  { id: 'c7', name: 'Bubblegum', image: 'bubblegum.png' },
  { id: 'c8', name: 'Derpy', image: 'derpy.png' },
  { id: 'c9', name: 'Ember', image: 'ember.png' },
  { id: 'c10', name: 'Happy', image: 'happy.png' },
  { id: 'c11', name: 'Hiccups', image: 'hiccups.png' },
  { id: 'c12', name: 'Moose', image: 'moose.png' },
  { id: 'c13', name: 'Mumbles', image: 'mumbles.png' },
  { id: 'c14', name: 'Party Hardy', image: 'partyhardy.png' },
  { id: 'c15', name: 'Scruffy', image: 'scruffy.png' },
  { id: 'c16', name: 'Stumbles', image: 'stumbles.png' },
  { id: 'c17', name: 'Wendy', image: 'wendy.png' },
  { id: 'c18', name: 'Yappy', image: 'yappy.png' },
  { id: 'c19', name: 'Osvaldo', image: 'osvaldo.png' },
  { id: 'c20', name: 'Reina', image: 'reina.png' },
  { id: 'c21', name: 'Sneaky', image: 'sneaky.png' },
  { id: 'c22', name: 'Tandy', image: 'tandy.png' },
  { id: 'c23', name: 'Windsong', image: 'winsong.png' },
  { id: 'c24', name: 'Fredrick', image: 'fredrick.png' }
];

const app = express();
app.use(cors());

const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: { origin: '*' }
});

// Store game rooms in memory
const parties = {};

function makeCode() {
  return nanoid(6).toUpperCase();
}

function cleanupEmptyParties() {
  Object.keys(parties).forEach(code => {
    const party = parties[code];
    if (Object.keys(party.players).length === 0) {
      delete parties[code];
      console.log(`[cleanup] Removed empty party: ${code}`);
    }
  });
}

io.on('connection', (socket) => {
  console.log(`[connect] Player connected: ${socket.id}`);

  socket.on('create_party', ({ name }) => {
    const code = makeCode();
    const party = {
      code,
      players: {},
      turn: null,
      pendingQuestion: null,
      gameStarted: false
    };
    
    party.players[socket.id] = { 
      id: socket.id, 
      name: name || 'Player 1', 
      side: 'A', 
      chosen: null, 
      marks: [] 
    };
    
    parties[code] = party;
    socket.join(code);
    socket.emit('party_created', { code, side: 'A' });
    io.to(code).emit('party_update', { players: Object.values(party.players) });
    console.log(`[create] Party created!`);
  });

  socket.on('join_party', ({ code, name }, callback) => {
    const party = parties[code];
    
    if (!party) {
      callback({ ok: false, error: 'Party not found' });
      return;
    }
    
    if (Object.keys(party.players).length >= 2) {
      callback({ ok: false, error: 'Party is full' });
      return;
    }
    
    party.players[socket.id] = { 
      id: socket.id, 
      name: name || 'Player 2', 
      side: 'B', 
      chosen: null, 
      marks: [] 
    };
    
    socket.join(code);
    io.to(code).emit('party_update', { players: Object.values(party.players) });
    callback({ ok: true });
    
    // Both players joined, time to pick characters
    io.to(code).emit('need_choose_character');
    console.log(`[join] Player joined party ${code}. Total players: ${Object.keys(party.players).length}`);
  });

  socket.on('choose_character', ({ code, character }) => {
    const party = parties[code];
    if (!party) return;
    
    const player = party.players[socket.id];
    if (!player) return;
    
    player.chosen = character;
    console.log(`[debug] Player ${socket.id} chose character: ${character}`);
    
    io.to(code).emit('party_update', { players: Object.values(party.players) });
    
    const playersArray = Object.values(party.players);
    if (playersArray.length === 2 && playersArray.every(p => p.chosen)) {
      // Both players chose characters, start game
      const playerIds = Object.keys(party.players);
      const firstPlayer = playerIds[Math.floor(Math.random() * playerIds.length)];
      
      party.turn = firstPlayer;
      party.gameStarted = true;
      
      io.to(code).emit('game_start', { firstPlayer });
      console.log(`[game] Started in ${code}. First player: ${firstPlayer}`);
    }
  });

  socket.on('ask_question', ({ code, question }) => {
    const party = parties[code];
    if (!party || !party.gameStarted) return;
    
    if (party.turn !== socket.id) {
      socket.emit('error_message', 'Not your turn');
      return;
    }
    
    party.pendingQuestion = { from: socket.id, question };
    const otherPlayerId = Object.keys(party.players).find(id => id !== socket.id);
    
    if (otherPlayerId) {
      io.to(otherPlayerId).emit('question_asked', { 
        question, 
        from: party.players[socket.id].name 
      });
      io.to(code).emit('question_sent', { 
        question, 
        from: party.players[socket.id].name 
      });
    }
  });

  socket.on('answer_question', ({ code, answer }) => {
    const party = parties[code];
    if (!party || !party.pendingQuestion) return;
    
    const { from: askerId, question } = party.pendingQuestion;
    io.to(askerId).emit('question_answered', { question, answer });
    party.pendingQuestion = null;
    
    // Allow the asker to mark or guess
    io.to(askerId).emit('allow_actions');
  });

  socket.on('mark_character', ({ code, character }) => {
    const party = parties[code];
    if (!party) return;
    
    const player = party.players[socket.id];
    if (!player) return;
    
    if (!player.marks.includes(character)) {
      player.marks.push(character);
    }
    
    socket.emit('marks_updated', player.marks);
  });

  socket.on('guess_character', ({ code, character }) => {
    const party = parties[code];
    if (!party) return;
    
    const opponentId = Object.keys(party.players).find(id => id !== socket.id);
    if (!opponentId) return;
    
    const opponent = party.players[opponentId];
    const guesser = party.players[socket.id];
    
    console.log(`[debug] Guess received: "${character}"`);
    console.log(`[debug] Opponent chosen ID: "${opponent.chosen}"`);
    
    // Find the character object that the opponent chose
    const opponentChosenCharacter = CHARACTERS.find(c => c.id === opponent.chosen);
    console.log(`[debug] Opponent chosen clown object:`, opponentChosenCharacter);
    
    if (opponentChosenCharacter) {
      console.log(`[debug] Comparing guess "${character}" with secret "${opponentChosenCharacter.name}"`);
      
      if (character === opponentChosenCharacter.name) {
        // Correct guess - game over
        console.log(`[debug] Correct guess! Game over.`);
        io.to(code).emit('game_over', { 
          winner: socket.id, 
          winnerName: guesser.name,
          secretCharacter: opponentChosenCharacter.name
        });
        delete parties[code];
      } else {
        // Wrong guess - switch turns
        console.log(`[debug] Wrong guess. Switching turns.`);
        socket.emit('wrong_guess', { character });
        party.turn = opponentId;
        io.to(code).emit('turn_changed', { turn: party.turn });
      }
    } else {
      console.log(`[debug] ERROR: Could not find opponent's chosen clown for ID: ${opponent.chosen}`);
      socket.emit('error_message', 'Error processing guess');
    }
  });

  socket.on('end_turn', ({ code }) => {
    const party = parties[code];
    if (!party) return;
    
    const otherPlayerId = Object.keys(party.players).find(id => id !== socket.id);
    if (!otherPlayerId) return;
    
    party.turn = otherPlayerId;
    io.to(code).emit('turn_changed', { turn: party.turn });
  });

  socket.on('disconnect', () => {
    console.log(`[disconnect] Player disconnected: ${socket.id}`);
    
    // Remove player from any party
    for (const code in parties) {
      const party = parties[code];
      if (party.players[socket.id]) {
        delete party.players[socket.id];
        io.to(code).emit('player_left', { playerId: socket.id });
        
        // If party is empty, clean it up
        if (Object.keys(party.players).length === 0) {
          delete parties[code];
          console.log(`[cleanup] Removed party ${code} (no players left)`);
        }
      }
    }
  });
});

// Clean up empty parties every 30 minutes
setInterval(cleanupEmptyParties, 30 * 60 * 1000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🎮 GuessWho server running on port ${PORT}`);
  console.log(`📱 Ready for players!`);
});