import React, { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import CHARACTERS from './characters'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'
const socket = io(SERVER_URL)

export default function App() {
  // Main state
  const [name, setName] = useState('')
  const [view, setView] = useState('menu') // menu, lobby, pick, game
  const [code, setCode] = useState('')
  const [mySide, setMySide] = useState(null)
  const [players, setPlayers] = useState([])
  
  // Game state
  const [needPick, setNeedPick] = useState(false)
  const [chosen, setChosen] = useState(null)
  const [isGameStarted, setGameStarted] = useState(false)
  const [turnSocketId, setTurnSocketId] = useState(null)
  const [isMyTurn, setIsMyTurn] = useState(false)
  
  // Question/Answer state
  const [incomingQuestion, setIncomingQuestion] = useState(null)
  const [typedQuestion, setTypedQuestion] = useState('')
  const [waitingForAnswer, setWaitingForAnswer] = useState(false)
  const [canTakeActions, setCanTakeActions] = useState(false)
  const [hasAskedQuestion, setHasAskedQuestion] = useState(false)
  const [lastAnswerReceived, setLastAnswerReceived] = useState(null) // 'Yes' or 'No'
  
  // Character action state
  const [selectedCharacter, setSelectedCharacter] = useState(null)
  const [showCharacterActions, setShowCharacterActions] = useState(false)
  
  // UI state
  const [myMarks, setMyMarks] = useState([])
  const [messages, setMessages] = useState([])
  const [isConnected, setIsConnected] = useState(false)
  const [gameWinner, setGameWinner] = useState(null) // just store the winner name

  useEffect(() => {
    // Connection status
    socket.on('connect', () => {
      setIsConnected(true)
      addMessage('Connected to server')
    })

    socket.on('disconnect', () => {
      setIsConnected(false)
      addMessage('Disconnected from server')
    })

    // Party events
    socket.on('party_created', ({ code, side }) => {
      setCode(code)
      setMySide(side)
      setView('lobby')
      addMessage(`Party created! Code: ${code}`)
    })

    socket.on('party_update', ({ players }) => {
      setPlayers(players)
    })

    socket.on('need_choose_character', () => {
      setNeedPick(true)
      setView('pick')
      addMessage('Time to pick your secret character!')
    })

    // Game events
    socket.on('game_start', ({ firstPlayer }) => {
      setGameStarted(true)
      setTurnSocketId(firstPlayer)
      setIsMyTurn(firstPlayer === socket.id)
      setView('game')
      addMessage(firstPlayer === socket.id ? 'Game started! Your turn first.' : 'Game started! Opponent goes first.')
    })

    socket.on('question_sent', ({ question, from }) => {
      if (socket.id !== turnSocketId) {
        addMessage(`${from} asked: "${question}"`)
      }
    })

    socket.on('question_asked', ({ question, from }) => {
      setIncomingQuestion({ question, from })
      addMessage(`Question from ${from}: "${question}"`)
    })

    socket.on('question_answered', ({ question, answer }) => {
      addMessage(`Your question: "${question}" → Answer: ${answer}`)
      setWaitingForAnswer(false)
      setHasAskedQuestion(true)
      setLastAnswerReceived(answer)
    })

    socket.on('allow_actions', () => {
      setCanTakeActions(true)
      addMessage('You can now mark characters or make a guess!')
    })

    socket.on('marks_updated', (marks) => {
      setMyMarks(marks)
      setSelectedCharacter(null)
      setShowCharacterActions(false)
    })

    socket.on('wrong_guess', ({ character }) => {
      addMessage(`❌ Wrong guess: ${character}. Turn passed to opponent.`)
      setCanTakeActions(false)
      setHasAskedQuestion(false)
      setLastAnswerReceived(null)
      setSelectedCharacter(null)
      setShowCharacterActions(false)
    })

    socket.on('turn_changed', ({ turn }) => {
      setTurnSocketId(turn)
      setIsMyTurn(turn === socket.id)
      setCanTakeActions(false)
      setWaitingForAnswer(false)
      setHasAskedQuestion(false)
      setLastAnswerReceived(null)
      setSelectedCharacter(null)
      setShowCharacterActions(false)
      addMessage(turn === socket.id ? 'Your turn!' : "Opponent's turn.")
    })

    socket.on('game_over', ({ winnerName, secretCharacter }) => {
      setGameWinner(winnerName)
      addMessage(`🎉 Game Over! Winner: ${winnerName}. Secret was: ${secretCharacter}`)
    })

    socket.on('player_left', () => {
      addMessage('Other player left. Returning to menu.')
      alert('Other player left the game.')
      resetGame()
    })

    socket.on('error_message', (error) => {
      addMessage(`Error: ${error}`)
    })

    return () => {
      socket.off()
    }
  }, [name])

  function addMessage(message) {
    setMessages(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`])
  }

  function resetGame() {
    setView('menu')
    setGameStarted(false)
    setIsMyTurn(false)
    setTurnSocketId(null)
    setIncomingQuestion(null)
    setTypedQuestion('')
    setWaitingForAnswer(false)
    setCanTakeActions(false)
    setHasAskedQuestion(false)
    setLastAnswerReceived(null)
    setSelectedCharacter(null)
    setShowCharacterActions(false)
    setMyMarks([])
    setChosen(null)
    setNeedPick(false)
    setCode('')
    setPlayers([])
    setGameWinner(null)
  }

  // Menu actions
  function handleCreateParty() {
    if (!name.trim()) {
      setName('Player1')
    }
    socket.emit('create_party', { name: name.trim() || 'Player1' })
  }

  function handleJoinParty(joinCode) {
    if (!joinCode.trim()) {
      addMessage('Please enter a party code')
      return
    }
    if (!name.trim()) {
      setName('Player2')
    }
    
    socket.emit('join_party', { 
      code: joinCode.trim().toUpperCase(), 
      name: name.trim() || 'Player2' 
    }, (response) => {
      if (response && response.ok) {
        setCode(joinCode.trim().toUpperCase())
        setMySide('B')
        setView('lobby')
        addMessage(`Joined party: ${joinCode}`)
      } else {
        addMessage(`Failed to join: ${response?.error || 'Unknown error'}`)
        alert(`Failed to join party: ${response?.error || 'Unknown error'}`)
      }
    })
  }

  // Character selection
  function confirmSecret() {
    if (!chosen) {
      addMessage('Please select a character first!')
      return
    }
    socket.emit('choose_character', { code, character: chosen })
    setNeedPick(false)
    addMessage(`Secret character chosen! Waiting for opponent...`)
    setView('lobby')
  }

  // Game actions
  function sendQuestion() {
    if (!typedQuestion.trim()) {
      addMessage('Please type a question first!')
      return
    }
    if (!isMyTurn) {
      addMessage("It's not your turn!")
      return
    }
    if (hasAskedQuestion) {
      addMessage("You can only ask one question per turn!")
      return
    }
    
    socket.emit('ask_question', { code, question: typedQuestion.trim() })
    addMessage(`You asked: "${typedQuestion.trim()}"`)
    setTypedQuestion('')
    setWaitingForAnswer(true)
  }

  function answerQuestion(answer) {
    if (!incomingQuestion) return
    
    socket.emit('answer_question', { code, answer })
    addMessage(`You answered: ${answer}`)
    setIncomingQuestion(null)
  }

  function handleCharacterClick(characterName) {
    if (!isMyTurn && !canTakeActions) {
      addMessage("Wait for your turn or answer a question first!")
      return
    }
    
    if (myMarks.includes(characterName)) {
      addMessage("This character is already marked!")
      return
    }
    
    setSelectedCharacter(characterName)
    setShowCharacterActions(true)
  }

  function markCharacter(characterName) {
    socket.emit('mark_character', { code, character: characterName })
    addMessage(`Marked: ${characterName}`)
  }

  function guessCharacter(characterName) {
  if (!isMyTurn) {
    addMessage("It's not your turn!")
    return
  }

  // removed window.confirm
  socket.emit('guess_character', { code, character: characterName })
  addMessage(`You guessed: ${characterName}`)
  setCanTakeActions(false)
  setSelectedCharacter(null)
  setShowCharacterActions(false)
}


  function endTurn() {
    if (!isMyTurn) return
    
    socket.emit('end_turn', { code })
    setCanTakeActions(false)
    setHasAskedQuestion(false)
    setLastAnswerReceived(null)
    setSelectedCharacter(null)
    setShowCharacterActions(false)
  }

  function requestPlayAgain() {
    addMessage('Returning to main menu for new game!')
    resetGame()
  }

  // Render different views
  if (view === 'menu') {
    return (
      <div className="page menu">
        <div className="header">
          <h1>🎮 Guess The Clown</h1>
          <div className={`status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </div>
        </div>

        <div className="menu-content">
          <div className="name-input">
            <label>Your Name:</label>
            <input 
              type="text" 
              placeholder="Enter your name" 
              value={name} 
              onChange={(e) => setName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateParty()}
              maxLength={20}
            />
          </div>

          <div className="menu-buttons">
            <button className="create-btn" onClick={handleCreateParty}>
              🎪 Create Party
            </button>
            <JoinPartyForm onJoin={handleJoinParty} />
          </div>

          <div className="instructions">
            <h3>📋 Game Rules:</h3>
            <div className="rules">
              <div className="rule">
                <strong>🎯 Objective:</strong> Be the first to guess your opponent's secret clown!
              </div>
              <div className="rule">
                <strong>🎮 Setup:</strong> Each player picks a secret clown that the other must guess.
              </div>
              <div className="rule">
                <strong>❓ Asking Questions:</strong> Take turns asking YES/NO questions only ("Does your clown wear glasses?")
              </div>
              <div className="rule">
                <strong>📝 One Question Per Turn:</strong> You can only ask ONE question per turn. After getting an answer, you can mark clowns or guess.
              </div>
              <div className="rule">
                <strong>❌ Marking Clowns:</strong> After each answer, click clowns to mark them with X if they don't match the answer.
              </div>
              <div className="rule">
                <strong>🎲 Making a Guess:</strong> When you think you know who it is, click a clown and choose "Guess". If wrong, you lose your turn!
              </div>
              <div className="rule">
                <strong>🏆 Winning:</strong> First player to correctly guess the opponent's secret clown wins!
              </div>
            </div>
          </div>
        </div>

        <ChatBox messages={messages} />
      </div>
    )
  }

  if (view === 'lobby') {
    return (
      <div className="page lobby">
        <div className="header">
          <h2>🎪 Party: {code}</h2>
          <button onClick={resetGame} className="leave-btn">Leave Party</button>
        </div>

        <div className="players-list">
          <h3>Players ({players.length}/2):</h3>
          {players.map(player => (
            <div key={player.id} className="player-card">
              <span className="player-name">{player.name}</span>
              <span className="player-status">
                {player.chosen ? '✅ Ready' : '⏳ Picking...'}
              </span>
            </div>
          ))}
        </div>

        {needPick && (
          <div className="character-selection">
            <h3>🎭 Pick Your Secret Clown:</h3>
            <CharacterGrid 
              characters={CHARACTERS}
              selectable={true}
              selected={chosen}
              onSelect={setChosen}
            />
            <button onClick={confirmSecret} disabled={!chosen} className="confirm-btn">
              ✅ Confirm Secret Clown
            </button>
          </div>
        )}

        {!needPick && (
          <div className="waiting">
            <p>⏳ Waiting for both players to pick their secret clowns...</p>
          </div>
        )}

        <ChatBox messages={messages} />
      </div>
    )
  }

  if (view === 'pick') {
    return (
      <div className="page pick">
        <h2>🎭 Pick Your Secret Clown</h2>
        <p>Choose a clown for your opponent to guess:</p>
        
        <CharacterGrid 
          characters={CHARACTERS}
          selectable={true}
          selected={chosen}
          onSelect={setChosen}
        />
        
        <button onClick={confirmSecret} disabled={!chosen} className="confirm-btn">
          ✅ Confirm Secret Clown
        </button>

        <ChatBox messages={messages} />
      </div>
    )
  }

  // Game view
  return (
    <div className="page game">
      <div className="game-header">
        <div className="game-info">
          <div>🎪 Party: {code}</div>
          <div>👤 You: {name} ({mySide})</div>
          <div className={`turn-indicator ${isMyTurn ? 'my-turn' : 'their-turn'}`}>
            {isMyTurn ? '🔥 Your Turn' : '⏳ Their Turn'}
          </div>
        </div>
        <button onClick={resetGame} className="leave-btn">Leave Game</button>
      </div>

      <div className="game-content">
        <div className="game-board">
          <h3>🎭 Clown Board</h3>
          <CharacterGrid 
            characters={CHARACTERS}
            marks={myMarks}
            onClick={handleCharacterClick}
          />
          
          {showCharacterActions && selectedCharacter && (
            <div className="character-actions-modal">
              <div className="modal-content">
                <h4>What do you want to do with {selectedCharacter}?</h4>
                <div className="action-buttons">
                  <button 
                    onClick={() => {
                      markCharacter(selectedCharacter)
                    }}
                    className="mark-btn"
                    disabled={!canTakeActions}
                  >
                    ❌ Mark with X
                  </button>
                  <button 
                    onClick={() => {
                      guessCharacter(selectedCharacter)
                    }}
                    className="guess-btn"
                    disabled={!isMyTurn}
                  >
                    🎯 Guess This Clown
                  </button>
                  <button 
                    onClick={() => {
                      setSelectedCharacter(null)
                      setShowCharacterActions(false)
                    }}
                    className="cancel-btn"
                  >
                    ❌ Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="game-controls">
          <div className="controls-section">
            <h3>🎯 Game Actions</h3>
            
            {gameWinner ? (
              <div className="game-over-section">
                <div className="winner-announcement">
                  🏆 <strong>{gameWinner} WON!</strong> 🏆
                </div>
                <button onClick={requestPlayAgain} className="play-again-main-btn">
                  🎮 Play Again
                </button>
              </div>
            ) : (
              <>
                {isMyTurn ? (
                  <div className="question-section">
                    <h4>Ask a Question:</h4>
                    <div className="question-input">
                      <input 
                        type="text" 
                        placeholder="Type your yes/no question..." 
                        value={typedQuestion}
                        onChange={(e) => setTypedQuestion(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && sendQuestion()}
                        disabled={waitingForAnswer || hasAskedQuestion}
                        maxLength={200}
                      />
                      <button 
                        onClick={sendQuestion} 
                        disabled={waitingForAnswer || !typedQuestion.trim() || hasAskedQuestion}
                        className="send-btn"
                      >
                        📤 Send
                      </button>
                    </div>
                    {waitingForAnswer && (
                      <div className="waiting-status">⏳ Waiting for answer...</div>
                    )}
                    {hasAskedQuestion && !waitingForAnswer && lastAnswerReceived && (
                      <div className={`question-limit-notice ${lastAnswerReceived.toLowerCase()}`}>
                        <strong>{lastAnswerReceived}!</strong> You can now mark clowns or make a guess!
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="answer-section">
                    {incomingQuestion ? (
                      <div className="incoming-question">
                        <h4>Answer this question:</h4>
                        <div className="question-text">"{incomingQuestion.question}"</div>
                        <div className="answer-buttons">
                          <button onClick={() => answerQuestion('Yes')} className="yes-btn">
                            ✅ Yes
                          </button>
                          <button onClick={() => answerQuestion('No')} className="no-btn">
                            ❌ No
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="waiting-status">⏳ Waiting for question...</div>
                    )}
                  </div>
                )}

                {(canTakeActions || hasAskedQuestion) && (
                  <div className="action-hint">
                    💡 Click any clown to mark with X or make your guess!
                  </div>
                )}

                {isMyTurn && (
                  <div className="turn-actions">
                    <button onClick={endTurn} className="end-turn-btn">
                      ⏭️ End Turn
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="stats-section">
            <h4>📊 Your Progress</h4>
            <div className="stats">
              <div>Clowns marked: {myMarks.length}</div>
              <div>Remaining: {CHARACTERS.length - myMarks.length}</div>
            </div>
          </div>
        </div>
      </div>

      <ChatBox messages={messages} />
    </div>
  )
}

// Helper Components
function JoinPartyForm({ onJoin }) {
  const [joinCode, setJoinCode] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    onJoin(joinCode)
    setJoinCode('')
  }

  return (
    <form onSubmit={handleSubmit} className="join-form">
      <input 
        type="text" 
        placeholder="Enter party code" 
        value={joinCode}
        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
        maxLength={6}
        className="code-input"
      />
      <button type="submit" className="join-btn">
        🚪 Join Party
      </button>
    </form>
  )
}

function CharacterGrid({ characters, selectable, selected, onSelect, marks = [], onClick }) {
  return (
    <div className="character-grid">
      {characters.map(character => {
        const isMarked = marks.includes(character.name)
        const isSelected = selected === character.id
        
        return (
          <div 
            key={character.id} 
            className={`character-card ${isSelected ? 'selected' : ''} ${isMarked ? 'marked' : ''}`}
            onClick={() => {
              if (selectable && onSelect) {
                onSelect(character.id)
              } else if (onClick) {
                onClick(character.name)
              }
            }}
          >
            <div className="character-avatar">
              <img 
                src={`/images/${character.image}`} 
                alt={character.name}
                className="character-image"
                onError={(e) => {
                  // Fallback to letter if image doesn't load
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
              <div className="character-letter" style={{ display: 'none' }}>
                {character.name[0].toUpperCase()}
              </div>
            </div>
            <div className="character-name">{character.name}</div>
            {isMarked && <div className="mark">❌</div>}
            {selectable && isSelected && <div className="selection">✅</div>}
          </div>
        )
      })}
    </div>
  )
}

function ChatBox({ messages }) {
  const chatRef = React.useRef(null)

  React.useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h4>📜 Game Log</h4>
      </div>
      <div className="chat-messages" ref={chatRef}>
        {messages.length === 0 ? (
          <div className="no-messages">No messages yet...</div>
        ) : (
          messages.map((message, index) => (
            <div key={index} className="chat-message">
              {message}
            </div>
          ))
        )}
      </div>
    </div>
  )
}