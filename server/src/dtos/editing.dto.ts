import { z } from 'zod';

export enum AssetEditAction {
  Crop = 'crop',
  Rotate = 'rotate',
  Mirror = 'mirror',
}

export enum MirrorAxis {
  Horizontal = 'horizontal',
  Vertical = 'vertical',
}

// --- Parameter Schemas ---

export const CropParametersSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
});
export type CropParameters = z.infer<typeof CropParametersSchema>;

export const RotateParametersSchema = z.object({
  angle: z.number().refine((v) => [0, 90, 180, 270].includes(v), {
    message: 'Angle must be one of: 0, 90, 180, 270',
  }),
});
export type RotateParameters = z.infer<typeof RotateParametersSchema>;

export const MirrorParametersSchema = z.object({
  axis: z.nativeEnum(MirrorAxis),
});
export type MirrorParameters = z.infer<typeof MirrorParametersSchema>;

// --- Action Item Types ---

export type AssetEditActionItem =
  | {
      action: AssetEditAction.Crop;
      parameters: CropParameters;
    }
  | {
      action: AssetEditAction.Rotate;
      parameters: RotateParameters;
    }
  | {
      action: AssetEditAction.Mirror;
      parameters: MirrorParameters;
    };

export type AssetEditActionParameter = {
  [AssetEditAction.Crop]: CropParameters;
  [AssetEditAction.Rotate]: RotateParameters;
  [AssetEditAction.Mirror]: MirrorParameters;
};

// --- Edit Action Schemas ---

const AssetEditActionCropSchema = z.object({
  action: z.literal(AssetEditAction.Crop),
  parameters: CropParametersSchema,
});

const AssetEditActionRotateSchema = z.object({
  action: z.literal(AssetEditAction.Rotate),
  parameters: RotateParametersSchema,
});

const AssetEditActionMirrorSchema = z.object({
  action: z.literal(AssetEditAction.Mirror),
  parameters: MirrorParametersSchema,
});

const AssetEditActionSchema = z.discriminatedUnion('action', [
  AssetEditActionCropSchema,
  AssetEditActionRotateSchema,
  AssetEditActionMirrorSchema,
]);

export const AssetEditActionListSchema = z.object({
  edits: z.array(AssetEditActionSchema).min(1).refine(
    (edits) => {
      const actionSet = new Set<string>();
      for (const edit of edits) {
        const key = edit.action === 'mirror' ? `${edit.action}-${JSON.stringify(edit.parameters)}` : edit.action;
        if (actionSet.has(key)) return false;
        actionSet.add(key);
      }
      return true;
    },
    { message: 'Duplicate edit actions are not allowed' },
  ),
});
export type AssetEditActionListDto = z.infer<typeof AssetEditActionListSchema>;

export const AssetEditsSchema = AssetEditActionListSchema.extend({
  assetId: z.string().uuid(),
});
export type AssetEditsDto = z.infer<typeof AssetEditsSchema>;
