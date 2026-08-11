import { OAuth2Client } from 'google-auth-library';

const GMAIL_API_BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface GmailHeader {
  name?: string;
  value?: string;
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

interface GmailMessageResponse {
  id?: string;
  threadId?: string;
  historyId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPart & { headers?: GmailHeader[] };
}

interface GmailListResponse {
  messages?: Array<{ id?: string }>;
  nextPageToken?: string;
}

interface GmailHistoryResponse {
  historyId?: string;
  nextPageToken?: string;
  history?: Array<{
    messagesAdded?: Array<{ message?: { id?: string } }>;
  }>;
}

interface GmailWatchResponse {
  historyId?: string;
  expiration?: string;
}

export interface GmailMessage {
  providerMessageId: string;
  threadId: string;
  historyId: string;
  sender: string;
  subject: string;
  snippet: string;
  bodyText: string;
  receivedAt: Date;
}

export interface GmailMessagePage {
  messageIds: string[];
  nextPageToken: string | null;
}

export interface GmailHistoryPage {
  messageIds: string[];
  historyId: string;
  nextPageToken: string | null;
}

export interface GmailWatch {
  historyId: string;
  expiresAt: Date;
}

export class GmailHistoryExpiredError extends Error {
  constructor() {
    super('Gmail history cursor expired');
    this.name = 'GmailHistoryExpiredError';
  }
}

export class GmailClient {
  private readonly oauthClient: OAuth2Client;

  constructor(refreshToken: string, clientId: string, clientSecret: string) {
    this.oauthClient = new OAuth2Client({ clientId, clientSecret });
    this.oauthClient.setCredentials({ refresh_token: refreshToken });
  }

  async listMessages(
    after: Date,
    pageToken: string | null,
    maxResults = 50,
  ): Promise<GmailMessagePage> {
    const query = new URLSearchParams({
      maxResults: String(maxResults),
      q: `after:${Math.floor(after.getTime() / 1000)}`,
    });
    if (pageToken) query.set('pageToken', pageToken);
    const response = await this.request<GmailListResponse>(`/messages?${query.toString()}`);
    return {
      messageIds: (response.messages ?? [])
        .map((message) => message.id)
        .filter((id): id is string => Boolean(id)),
      nextPageToken: response.nextPageToken ?? null,
    };
  }

  async getMessage(messageId: string): Promise<GmailMessage> {
    const query = new URLSearchParams({ format: 'full' });
    const response = await this.request<GmailMessageResponse>(
      `/messages/${encodeURIComponent(messageId)}?${query.toString()}`,
    );
    if (!response.id || !response.threadId || !response.internalDate) {
      throw new Error('Gmail returned an incomplete message');
    }

    const headers = response.payload?.headers ?? [];
    return {
      providerMessageId: response.id,
      threadId: response.threadId,
      historyId: response.historyId ?? '0',
      sender: this.header(headers, 'From'),
      subject: this.header(headers, 'Subject'),
      snippet: response.snippet ?? '',
      bodyText: this.extractText(response.payload),
      receivedAt: new Date(Number(response.internalDate)),
    };
  }

  async listHistory(startHistoryId: string, pageToken: string | null): Promise<GmailHistoryPage> {
    const query = new URLSearchParams({
      startHistoryId,
      historyTypes: 'messageAdded',
      maxResults: '50',
    });
    if (pageToken) query.set('pageToken', pageToken);
    const response = await this.request<GmailHistoryResponse>(`/history?${query.toString()}`, true);
    if (!response.historyId) {
      throw new Error('Gmail returned history without a cursor');
    }

    const messageIds = new Set<string>();
    for (const history of response.history ?? []) {
      for (const added of history.messagesAdded ?? []) {
        if (added.message?.id) messageIds.add(added.message.id);
      }
    }

    return {
      messageIds: [...messageIds],
      historyId: response.historyId,
      nextPageToken: response.nextPageToken ?? null,
    };
  }

  async watch(topicName: string): Promise<GmailWatch> {
    const response = await this.request<GmailWatchResponse>('/watch', false, {
      topicName,
      labelIds: ['INBOX'],
      labelFilterBehavior: 'include',
    });
    if (!response.historyId || !response.expiration) {
      throw new Error('Gmail returned an incomplete watch response');
    }
    return {
      historyId: response.historyId,
      expiresAt: new Date(Number(response.expiration)),
    };
  }

  private async request<T>(
    path: string,
    historyRequest = false,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const accessToken = await this.oauthClient.getAccessToken();
    if (!accessToken.token) throw new Error('Google did not issue an access token');

    const response = await fetch(`${GMAIL_API_BASE_URL}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (historyRequest && response.status === 404) throw new GmailHistoryExpiredError();
    if (!response.ok) {
      throw new Error(`Gmail request failed with status ${response.status}`);
    }
    return (await response.json()) as T;
  }

  private header(headers: GmailHeader[], name: string): string {
    return headers.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
  }

  private extractText(part: GmailPart | undefined): string {
    if (!part) return '';
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return Buffer.from(part.body.data, 'base64url').toString('utf8');
    }
    return (part.parts ?? [])
      .map((child) => this.extractText(child))
      .filter(Boolean)
      .join('\n');
  }
}
