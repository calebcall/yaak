import {readFileSync} from "node:fs";
import {PluginDefinition} from "@yaakapp/api";
import {convertResponse} from "./action";

export const plugin: PluginDefinition = {
    httpRequestActions: [
        {
            label: "Convert response",
            icon: "copy",
            async onSelect(ctx, args) {
                await convertResponse(ctx, args.httpRequest, {
                    readBody: (path) => readFileSync(path, "utf8"),
                });
            },
        },
    ],
};
