#!/usr/bin/env node
/**
 * MINTHI Printer Relay
 * Riceve bytes ESC/POS dal browser via WebSocket e li manda alla stampante via TCP (porta 9100).
 *
 * Utilizzo:
 *   node printer-relay.js [IP_STAMPANTE] [PORTA_WS]
 *
 * Esempi:
 *   node printer-relay.js 192.168.1.50        # usa porta WS default 8765
 *   node printer-relay.js 192.168.1.50 8765
 *
 * Installazione one-time:
 *   npm install ws                             # unica dipendenza
 *
 * Il relay rimane in ascolto. Il browser MINTHI si connette a ws://localhost:8765
 * e manda bytes ESC/POS — il relay li forwarda via TCP alla stampante.
 */

const net = require('net')
const http = require('http')

// --- Argomenti ---
const PRINTER_IP   = process.argv[2] || '192.168.1.100'
const PRINTER_PORT = 9100
const WS_PORT      = parseInt(process.argv[3] || '8765', 10)

// --- Carica ws (WebSocket) ---
let WebSocketServer
try {
  WebSocketServer = require('ws').WebSocketServer
} catch (e) {
  console.error('\n❌ Modulo "ws" non trovato. Esegui prima:\n   npm install ws\n')
  process.exit(1)
}

// --- Server WebSocket ---
const server = new http.createServer()
const wss = new WebSocketServer({ server })

console.log(`\n🖨️  MINTHI Printer Relay`)
console.log(`   Stampante : ${PRINTER_IP}:${PRINTER_PORT}`)
console.log(`   WebSocket : ws://localhost:${WS_PORT}`)
console.log(`   In attesa di connessione dal browser...\n`)

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin || '(no origin)'
  console.log(`[WS] Browser connesso da ${origin}`)

  // Apri connessione TCP alla stampante
  const tcpClient = new net.Socket()
  let tcpConnected = false
  let pendingData = []

  tcpClient.connect(PRINTER_PORT, PRINTER_IP, () => {
    tcpConnected = true
    console.log(`[TCP] Connesso alla stampante ${PRINTER_IP}:${PRINTER_PORT}`)

    // Svuota buffer pendente
    for (const chunk of pendingData) {
      tcpClient.write(chunk)
    }
    pendingData = []
  })

  tcpClient.on('error', (err) => {
    console.error(`[TCP] Errore connessione stampante: ${err.message}`)
    ws.send(JSON.stringify({ type: 'error', message: `Stampante non raggiungibile: ${err.message}` }))
  })

  tcpClient.on('close', () => {
    console.log(`[TCP] Connessione stampante chiusa`)
  })

  // Ricevi dati dal browser → forwarda alla stampante
  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      // Bytes ESC/POS
      if (tcpConnected) {
        tcpClient.write(Buffer.from(data))
      } else {
        pendingData.push(Buffer.from(data))
      }
    } else {
      // Comando JSON (es. ping, richiesta stato)
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', printerIp: PRINTER_IP, connected: tcpConnected }))
        }
      } catch { /* ignora */ }
    }
  })

  ws.on('close', () => {
    console.log(`[WS] Browser disconnesso`)
    tcpClient.destroy()
  })

  ws.on('error', (err) => {
    console.error(`[WS] Errore WebSocket: ${err.message}`)
    tcpClient.destroy()
  })
})

server.listen(WS_PORT, '127.0.0.1', () => {
  console.log(`✅ Relay attivo — lascia questa finestra aperta.\n`)
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Porta ${WS_PORT} già in uso. Chiudi l'altro relay o usa una porta diversa.`)
  } else {
    console.error(`❌ Errore server: ${err.message}`)
  }
  process.exit(1)
})

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nRelay fermato.')
  process.exit(0)
})
