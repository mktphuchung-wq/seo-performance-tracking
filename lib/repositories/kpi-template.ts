import { query, transaction } from "../db";

export type TemplateComponentInput={componentKey:"seo_content"|"seo_performance"|"social_video";weightPct:number;isRequired:boolean;allowsNa:boolean;displayOrder:number};

export function validateTemplateComponents(components:TemplateComponentInput[]){
  const expected=["seo_content","seo_performance","social_video"];
  if(components.length!==3||expected.some((key)=>!components.some((row)=>row.componentKey===key)))throw new Error("A Final KPI template must contain exactly SEO Content, SEO Performance, and Social + Video.");
  const total=components.reduce((sum,row)=>sum+row.weightPct,0);
  if(components.some((row)=>!Number.isFinite(row.weightPct)||row.weightPct<0||row.weightPct>100)||Math.abs(total-100)>0.0001)throw new Error(`Final KPI component weights must total 100%; received ${total}.`);
  return components;
}

export async function listKpiTemplates(){const result=await query<any>(`select t.*,coalesce(json_agg(json_build_object(
  'componentKey',c.component_key,'weightPct',c.weight_pct,'isRequired',c.is_required,'allowsNa',c.allows_na,'displayOrder',c.display_order)
  order by c.display_order) filter(where c.id is not null),'[]'::json) as components
  from public.kpi_templates t left join public.kpi_template_components c on c.template_id=t.id
  group by t.id order by t.created_at desc`);return result.rows;}

export async function saveKpiTemplate(input:{templateKey:string;version:string;name:string;effectiveFrom:string;reason:string;actor:string;approve:boolean;components:TemplateComponentInput[]}){
  const components=validateTemplateComponents(input.components);if(!input.templateKey.trim()||!input.version.trim()||!input.name.trim()||!input.reason.trim())throw new Error("Template key, version, name, and audit reason are required.");
  return transaction(async(client)=>{const template=await client.query(`insert into public.kpi_templates
    (template_key,version,name,status,effective_from,reason,created_by,approved_by,approved_at,created_at,updated_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now())
    on conflict(template_key,version) do update set name=excluded.name,status=excluded.status,effective_from=excluded.effective_from,
    reason=excluded.reason,approved_by=excluded.approved_by,approved_at=excluded.approved_at,updated_at=now() returning id::text`,[
    input.templateKey.trim(),input.version.trim(),input.name.trim(),input.approve?"approved":"draft",input.effectiveFrom,input.reason.trim(),input.actor,input.approve?input.actor:null,input.approve?new Date().toISOString():null]);
    const id=template.rows[0].id;await client.query(`delete from public.kpi_template_components where template_id=$1`,[id]);
    for(const row of components)await client.query(`insert into public.kpi_template_components(template_id,component_key,weight_pct,is_required,allows_na,display_order)
      values($1,$2,$3,$4,$5,$6)`,[id,row.componentKey,row.weightPct,row.isRequired,row.allowsNa,row.displayOrder]);
    await client.query(`insert into public.application_audit_log(actor,action,entity_type,entity_id,after_value,reason)
      values($1,$2,'kpi_template',$3,$4::jsonb,$5)`,[input.actor,input.approve?"approve":"save_draft",id,JSON.stringify({version:input.version,components}),input.reason.trim()]);
    return{id,version:input.version,status:input.approve?"approved":"draft",components};});
}
