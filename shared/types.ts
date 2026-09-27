import {z} from 'zod';
export const pointSchema=z.object({x:z.number().min(-100000).max(100000),y:z.number().min(-100000).max(100000),p:z.number().min(0).max(1)});
export const strokeSchema=z.object({id:z.string().uuid(),tool:z.enum(['pen','pencil','marker','highlighter','line','rectangle','ellipse','text']),color:z.string().regex(/^#[0-9a-f]{6}$/i),width:z.number().min(1).max(48),points:z.array(pointSchema).min(1).max(10000),text:z.string().max(500).optional()});
export const docSchema=z.object({html:z.string().max(8000000),strokes:z.array(strokeSchema).max(3000),paper:z.enum(['white','black','blue']),direction:z.enum(['auto','ltr','rtl']),view:z.enum(['text','board'])});
export type Doc=z.infer<typeof docSchema>;export type Stroke=z.infer<typeof strokeSchema>;
export type Pad={id:string;name:string};
export type Meta={id:string;padId:string;title:string;locked:boolean;trashed:boolean;revision:number;updatedAt:string;createdAt:string};
export type User={id:string;name:string;email:string;role:'admin'|'user'};
export type Note=Meta&{doc:Doc};
export const emptyDoc=():Doc=>({html:'<p></p>',strokes:[],paper:'white',direction:'auto',view:'text'});
export const operationSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('create_note'),padId:z.string().uuid(),title:z.string().min(1).max(160),html:z.string().max(150000)}),
 z.object({type:z.literal('update_note'),id:z.string().uuid(),title:z.string().min(1).max(160).optional(),html:z.string().max(150000).optional(),paper:z.enum(['white','black','blue']).optional(),padId:z.string().uuid().optional()}),
 z.object({type:z.literal('trash_note'),id:z.string().uuid()}),
 z.object({type:z.literal('create_pad'),name:z.string().min(1).max(60)}),
 z.object({type:z.literal('rename_pad'),id:z.string().uuid(),name:z.string().min(1).max(60)}),
 z.object({type:z.literal('draw'),id:z.string().uuid(),strokes:z.array(strokeSchema).max(100)})
]);
export const planSchema=z.object({reply:z.string().max(12000),operations:z.array(operationSchema).max(8)});
export type Plan=z.infer<typeof planSchema>;
