import {PluginDefinition} from "@yaakapp/api";

export const plugin: PluginDefinition = {
    httpRequestActions: [
        {
            label: "Convert response",
            icon: "copy",
            async onSelect(_ctx, _args) {
                // Implemented in Task 12
            },
        },
    ],
};
