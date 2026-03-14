import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { getAccessToken } from './google-auth.service'
import { eventsRepo } from '../db/repositories/events.repo'
import type { CalendarEvent, Attendee } from '../../shared/types'
import Store from 'electron-store'

const store = new Store<{ googleClientId: string; googleClientSecret: string }>()

function getAuthClient(): OAuth2Client {
  const clientId = store.get('googleClientId', '') as string
  const clientSecret = store.get('googleClientSecret', '') as string
  const client = new OAuth2Client({ clientId, clientSecret })
  return client
}

async function getCalendarClient() {
  const auth = getAuthClient()
  const accessToken = await getAccessToken()
  auth.setCredentials({ access_token: accessToken })
  return google.calendar({ version: 'v3', auth })
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

async function fetchAndCacheEvents(timeMin: Date, timeMax: Date): Promise<CalendarEvent[]> {
  const calendar = await getCalendarClient()
  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 100,
  })

  const items = response.data.items ?? []
  const returnedIds: string[] = []
  for (const item of items) {
    if (!item.id || !item.summary) continue
    returnedIds.push(item.id)
    const attendees: Attendee[] = (item.attendees ?? []).map((a) => ({
      name: a.displayName ?? null,
      email: a.email ?? '',
      self: a.self ?? false,
    }))
    eventsRepo.upsert({
      id: item.id,
      calendarId: 'primary',
      title: item.summary,
      description: item.description ?? null,
      startTime: item.start?.dateTime ?? item.start?.date ?? '',
      endTime: item.end?.dateTime ?? item.end?.date ?? '',
      attendees,
      rawJson: JSON.stringify(item),
    })
  }

  // Remove any locally cached events that were deleted from Google Calendar.
  eventsRepo.pruneForRange(timeMin.toISOString(), timeMax.toISOString(), returnedIds)

  return eventsRepo.listForDateRange(timeMin.toISOString(), timeMax.toISOString())
}

export async function getTodaysEvents(): Promise<CalendarEvent[]> {
  const now = new Date()
  return fetchAndCacheEvents(startOfDay(now), endOfDay(now))
}

export async function getUpcomingEvents(days: number): Promise<CalendarEvent[]> {
  const start = new Date()
  const end = new Date()
  end.setDate(end.getDate() + days)
  return fetchAndCacheEvents(start, endOfDay(end))
}

export function assignLabel(eventId: string, labelId: string): void {
  eventsRepo.assignLabel(eventId, labelId)
}

export function removeLabel(eventId: string, labelId: string): void {
  eventsRepo.removeLabel(eventId, labelId)
}
