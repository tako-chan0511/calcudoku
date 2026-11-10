import { generateV2Puzzle, limitsFor as limitsForV2, validSettings as validV2Settings, versionFor, puzzleIdentity, DEFAULT_LIMITS, type GenerationLimits } from './generatorV2.ts'
import { generateV3Puzzle, limitsForV3 } from './generatorV3.ts'
import { LATEST_GENERATOR_VERSION, CURRENT_GENERATOR_VERSION, type GenerationMetrics, type GenerationProgress, type GenerationResult, type GenerationSettings } from './types.ts'
export { versionFor, puzzleIdentity, DEFAULT_LIMITS, type GenerationLimits }
export function validSettings(raw: unknown): raw is GenerationSettings {
  if(raw&&typeof raw==='object'&&(raw as Record<string,unknown>).generatorVersion===LATEST_GENERATOR_VERSION)return validV2Settings({...raw,generatorVersion:CURRENT_GENERATOR_VERSION})
  return validV2Settings(raw)
}
export const limitsFor = (settings: GenerationSettings): GenerationLimits => settings.generatorVersion===LATEST_GENERATOR_VERSION?limitsForV3(settings):limitsForV2(settings)
export function generatePuzzle(settings: GenerationSettings, overrides: Partial<GenerationLimits> = {}, onProgress?: (p: GenerationProgress) => void): GenerationResult {
  if(!validSettings(settings)){const metrics:GenerationMetrics={attempts:0,solverCalls:0,refinements:0,work:0};return{status:'failure',reason:'invalid-settings',metrics}}
  return settings.generatorVersion===LATEST_GENERATOR_VERSION?generateV3Puzzle(settings,overrides,onProgress):generateV2Puzzle(settings,overrides,onProgress)
}
