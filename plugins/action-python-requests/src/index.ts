import {PluginDefinition} from "@yaakapp/api";
import {generatePython} from "./generate";

export const plugin: PluginDefinition = {
    httpRequestActions: [
        {
            label: "Copy as Python",
            icon: "info",
            async onSelect(ctx, args) {
                const rendered = await ctx.httpRequest.render({
                    httpRequest: args.httpRequest,
                    purpose: "send",
                });

                await ctx.clipboard.copyText(generatePython(rendered, args.httpRequest));
                await ctx.toast.show({
                    color: "success",
                    message: "Copied python snippet to clipboard",
                });
            },
        },
    ],
};
