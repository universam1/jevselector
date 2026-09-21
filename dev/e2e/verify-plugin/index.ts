import { define } from "@opencode-ai/plugin/v2/promise"
const OUT = process.env.VERIFY_OUT || "/tmp/jevselector-verify.json"
export default define({
  id: "verify",
  async setup(ctx: any) {
    if (!ctx.session?.hook) return
    await ctx.session.hook("context", (event: any) => {
      try {
        const system = (event.system ?? []).map((s: any) => (typeof s === "string" ? s : s?.text ?? "")).join("\n")
        const m = system.match(/<available_skills>[\s\S]*?<\/available_skills>/)
        const ids = m ? [...m[0].matchAll(/<id>(.*?)<\/id>/g)].map((x:any)=>x[1]) : []
        require("node:fs").writeFileSync(OUT, JSON.stringify({ agent: event.agent, systemTokEst: Math.ceil(system.length/4), skills: ids.length, skillIds: ids, tools: Object.keys(event.tools ?? {}).length }, null, 2))
      } catch(e){ console.error("[verify]",e) }
    })
  },
})
