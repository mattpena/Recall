import React, { useState, useRef, useEffect } from 'react'
import { Box, TextField, IconButton, Typography, Paper, CircularProgress, Divider } from '@mui/material'
import { Send, Delete } from '@mui/icons-material'
import type { ChatMessage } from '../../../shared/types'

interface Message extends ChatMessage {
  id: string
}

export default function Chat(): React.ReactElement {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  // Ref accumulates chunks synchronously so onDone can read the final value without
  // relying on the streamed state (avoids React Strict Mode double-invoke side-effect bug).
  const streamingRef = useRef('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  useEffect(() => {
    const unsubChunk = window.electron.chat.onChunk((text) => {
      streamingRef.current += text
      setStreamingText(streamingRef.current)
    })
    const unsubDone = window.electron.chat.onDone(() => {
      const finalText = streamingRef.current
      streamingRef.current = ''
      setStreamingText('')
      if (finalText) {
        setMessages((msgs) => [
          ...msgs,
          { id: Date.now().toString(), role: 'assistant', content: finalText },
        ])
      }
      setIsStreaming(false)
    })
    return () => {
      unsubChunk()
      unsubDone()
    }
  }, [])

  async function handleSend(): Promise<void> {
    if (!input.trim() || isStreaming) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    }

    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setIsStreaming(true)
    setStreamingText('')

    try {
      await window.electron.chat.sendMessage(
        updatedMessages.map(({ role, content }) => ({ role, content }))
      )
    } catch (err) {
      setIsStreaming(false)
      setStreamingText('')
      setMessages((msgs) => [
        ...msgs,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        },
      ])
    }
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" fontWeight={600}>
          Chat
        </Typography>
        <IconButton onClick={() => setMessages([])} size="small" title="Clear chat">
          <Delete />
        </IconButton>
      </Box>

      {/* Messages */}
      <Box sx={{ flex: 1, overflow: 'auto', mb: 2 }}>
        {messages.length === 0 && !isStreaming && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              Ask about your meetings and projects
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Examples: "What are my next steps from yesterday?" · "Summarize last week's meetings" · "What's on my calendar tomorrow?"
            </Typography>
          </Box>
        )}

        {messages.map((msg) => (
          <Box
            key={msg.id}
            sx={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              mb: 2,
            }}
          >
            <Paper
              sx={{
                p: 1.5,
                maxWidth: '75%',
                bgcolor: msg.role === 'user' ? 'primary.main' : 'background.paper',
                color: msg.role === 'user' ? 'white' : 'text.primary',
                borderRadius: 2,
              }}
            >
              <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                {msg.content}
              </Typography>
            </Paper>
          </Box>
        ))}

        {/* Streaming response */}
        {(isStreaming || streamingText) && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 2 }}>
            <Paper sx={{ p: 1.5, maxWidth: '75%', bgcolor: 'background.paper', borderRadius: 2 }}>
              {streamingText ? (
                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                  {streamingText}
                  <Box component="span" sx={{ display: 'inline-block', width: 2, height: 16, bgcolor: 'text.primary', ml: 0.5, animation: 'blink 1s infinite' }} />
                </Typography>
              ) : (
                <CircularProgress size={20} />
              )}
            </Paper>
          </Box>
        )}

        <div ref={endRef} />
      </Box>

      <Divider />

      {/* Input */}
      <Box sx={{ display: 'flex', gap: 1, pt: 2 }}>
        <TextField
          fullWidth
          multiline
          maxRows={4}
          placeholder="Ask about your meetings, projects, or next steps…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          disabled={isStreaming}
          size="small"
        />
        <IconButton
          color="primary"
          onClick={handleSend}
          disabled={!input.trim() || isStreaming}
          sx={{ alignSelf: 'flex-end' }}
        >
          <Send />
        </IconButton>
      </Box>
    </Box>
  )
}
