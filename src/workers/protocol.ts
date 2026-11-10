import type { GenerationProgress, GenerationResult, GenerationSettings, PuzzleDefinition } from '../core/types.ts'
export interface GenerateRequest { type: 'generate'; requestId: number; settings: GenerationSettings }
export interface VerifyRequest { type: 'verify'; requestId: number; puzzle: PuzzleDefinition }
export type WorkerRequest = GenerateRequest | VerifyRequest
export interface GenerateResponse { type: 'generated'; requestId: number; result: GenerationResult }
export interface ProgressResponse { type: 'progress'; requestId: number; progress: GenerationProgress }
export interface VerifyResponse { type: 'verified'; requestId: number; valid: boolean }
