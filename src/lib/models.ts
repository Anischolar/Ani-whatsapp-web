import mongoose, { Schema, type Model, type Types } from "mongoose";

export const CONSENT_STATUSES = ["opted_in", "pending", "opted_out"] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];
export const CAMPAIGN_STATUSES = ["draft", "running", "paused", "completed", "cancelled"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export const LOG_STATUSES = ["pending", "sending", "sent", "failed", "skipped"] as const;
export type LogStatus = (typeof LOG_STATUSES)[number];
type OptOutMethod = "keyword" | "manual" | "import";

// Explicit interfaces instead of InferSchemaType: inference over these schemas makes tsc run out of memory.
export interface ContactDoc {
  _id: Types.ObjectId;
  /** E.164 without the leading "+", e.g. "14155550123". Doubles as the WhatsApp user id. */
  phone: string;
  name: string;
  tags: string[];
  attributes: Map<string, string> | Record<string, string>;
  consentStatus: ConsentStatus;
  consentSource: string;
  consentAt?: Date;
  optedOutAt?: Date;
  optOutMethod: OptOutMethod | "";
  lastMessagedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** Suppression list. Survives contact deletion so a re-import can never re-subscribe someone. */
export interface OptOutDoc {
  _id: Types.ObjectId;
  phone: string;
  method: OptOutMethod;
  reason: string;
  createdAt: Date;
}

export interface MediaDoc {
  _id: Types.ObjectId;
  fileName: string; // random name on disk
  originalName: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  createdAt: Date;
}

export interface TemplateDoc {
  _id: Types.ObjectId;
  name: string;
  body: string;
  mediaId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignDoc {
  _id: Types.ObjectId;
  name: string;
  templateId: Types.ObjectId | null;
  body: string;
  mediaId: Types.ObjectId | null;
  appendOptOutFooter: boolean;
  audienceTags: string[];
  minDelaySec: number;
  maxDelaySec: number;
  status: CampaignStatus;
  total: number;
  startedAt?: Date;
  completedAt?: Date;
  lastError: string;
  createdAt: Date;
}

/** One document per recipient per campaign. This collection *is* the persistent send queue. */
export interface MessageLogDoc {
  _id: Types.ObjectId;
  campaignId: Types.ObjectId;
  contactId: Types.ObjectId;
  phone: string;
  name: string;
  status: LogStatus;
  renderedBody: string;
  error: string;
  attempts: number;
  waMessageId: string;
  sentAt?: Date;
  updatedAt: Date;
}

const ContactSchema = new Schema<ContactDoc>(
  {
    phone: { type: String, required: true, unique: true },
    name: { type: String, default: "", trim: true, maxlength: 120 },
    tags: { type: [String], default: [], index: true },
    attributes: { type: Map, of: String, default: {} },
    consentStatus: { type: String, enum: CONSENT_STATUSES, default: "pending", index: true },
    consentSource: { type: String, default: "", maxlength: 300 },
    consentAt: { type: Date },
    optedOutAt: { type: Date },
    optOutMethod: { type: String, enum: ["keyword", "manual", "import", ""], default: "" },
    lastMessagedAt: { type: Date },
  },
  { timestamps: true },
);

const OptOutSchema = new Schema<OptOutDoc>(
  {
    phone: { type: String, required: true, unique: true },
    method: { type: String, enum: ["keyword", "manual", "import"], required: true },
    reason: { type: String, default: "", maxlength: 300 },
  },
  { timestamps: true },
);

const MediaSchema = new Schema<MediaDoc>(
  {
    fileName: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    width: Number,
    height: Number,
  },
  { timestamps: true },
);

const TemplateSchema = new Schema<TemplateDoc>(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 100 },
    body: { type: String, required: true, maxlength: 4096 },
    mediaId: { type: Schema.Types.ObjectId, ref: "Media", default: null },
  },
  { timestamps: true },
);

const CampaignSchema = new Schema<CampaignDoc>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    templateId: { type: Schema.Types.ObjectId, ref: "Template", default: null },
    body: { type: String, required: true, maxlength: 4096 },
    mediaId: { type: Schema.Types.ObjectId, ref: "Media", default: null },
    appendOptOutFooter: { type: Boolean, default: true },
    audienceTags: { type: [String], default: [] },
    minDelaySec: { type: Number, default: 8 },
    maxDelaySec: { type: Number, default: 20 },
    status: { type: String, enum: CAMPAIGN_STATUSES, default: "draft", index: true },
    total: { type: Number, default: 0 },
    startedAt: Date,
    completedAt: Date,
    lastError: { type: String, default: "" },
  },
  { timestamps: true },
);

const MessageLogSchema = new Schema<MessageLogDoc>(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: "Campaign", required: true },
    contactId: { type: Schema.Types.ObjectId, ref: "Contact", required: true },
    phone: { type: String, required: true },
    name: { type: String, default: "" },
    status: { type: String, enum: LOG_STATUSES, default: "pending" },
    renderedBody: { type: String, default: "" },
    error: { type: String, default: "" },
    attempts: { type: Number, default: 0 },
    waMessageId: { type: String, default: "" },
    sentAt: Date,
  },
  { timestamps: true },
);
MessageLogSchema.index({ campaignId: 1, status: 1, _id: 1 });
MessageLogSchema.index({ campaignId: 1, contactId: 1 }, { unique: true });
MessageLogSchema.index({ status: 1, sentAt: -1 });
MessageLogSchema.index({ phone: 1, status: 1 });

function model<T>(name: string, schema: Schema<T>): Model<T> {
  return (mongoose.models[name] as Model<T>) || mongoose.model<T>(name, schema);
}

export const Contact = model("Contact", ContactSchema);
export const OptOut = model("OptOut", OptOutSchema);
export const Media = model("Media", MediaSchema);
export const Template = model("Template", TemplateSchema);
export const Campaign = model("Campaign", CampaignSchema);
export const MessageLog = model("MessageLog", MessageLogSchema);
