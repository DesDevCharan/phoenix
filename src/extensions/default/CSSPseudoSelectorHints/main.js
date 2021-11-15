/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2017 - 2021 Adobe Systems Incorporated. All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

define(function (require, exports, module) {


    // Load dependent modules
    var AppInit             = brackets.getModule("utils/AppInit"),
        CodeHintManager     = brackets.getModule("editor/CodeHintManager"),
        TokenUtils          = brackets.getModule("utils/TokenUtils"),
        PseudoRulesText     = require("text!PseudoSelectors.json"),
        PseudoRules         = JSON.parse(PseudoRulesText);


    var TOKEN_TYPE_PSEUDO_CLASS   = 0,
        TOKEN_TYPE_PSEUDO_ELEMENT = 1,
        PUNCTUATION_CHAR          = ':';

    function _getPseudoContext(token, cursorText, ctx) {
        var slicedToken,
            contextType = -1;

        // Magic code to get around CM's 'pseudo' identification logic
        // As per CSS3 spec :
        // -> ':' identifies pseudo classes
        // -> '::' identifies pseudo elements
        // We should strictly check for single or double occurance of ':' by slicing
        // the line text till the token start position

        if (token.state.state === "pseudo") {
            slicedToken = cursorText.substr(0, token.start + 1).slice(-3);
        } else if (token.type === "variable-3") {
            slicedToken = cursorText.substr(0, token.start).slice(-3);
        }

        if (!slicedToken) {
            //We get here when in SCSS mode and the cursor is right after ':'
            //Test the previous token first
            TokenUtils.movePrevToken(ctx);
            if (ctx.token.string === PUNCTUATION_CHAR) {
                //We are in pseudo element context ('::')
                contextType = TOKEN_TYPE_PSEUDO_ELEMENT;
            } else {
                contextType = TOKEN_TYPE_PSEUDO_CLASS;
            }
        } else {
            if (slicedToken.slice(-2) === "::") {
                contextType = TOKEN_TYPE_PSEUDO_ELEMENT;
            } else if (slicedToken.slice(-1) === ":") {
                contextType = TOKEN_TYPE_PSEUDO_CLASS;
            }
        }

        return contextType;
    }

    /**
     * @constructor
     */
    function PseudoSelectorHints() {
    }

    function _validatePseudoContext(token) {
        return token.state.state === "pseudo" || token.type === "variable-3" || token.string === PUNCTUATION_CHAR;
    }

    // As we are only going to provide :<pseudo> name hints
    // we should claim that we don't have hints for anything else
    PseudoSelectorHints.prototype.hasHints = function (editor, implicitChar) {
        var pos = editor.getCursorPos(),
            token = editor._codeMirror.getTokenAt(pos);

        this.editor = editor;

        // Check if we are at ':' pseudo rule or in 'variable-3' 'def' context
        return _validatePseudoContext(token);
    };

    PseudoSelectorHints.prototype.getHints = function (implicitChar) {
        var pos = this.editor.getCursorPos(),
            token = this.editor._codeMirror.getTokenAt(pos),
            filter = token.type === "variable-3" ? token.string : "",
            lineTillCursor = this.editor._codeMirror.getLine(pos.line),
            ctx = TokenUtils.getInitialContext(this.editor._codeMirror, pos);

        if (!_validatePseudoContext(token)) {
            return null;
        }

        // validate and keep the context in scope so that it can be used while getting description
        this.context = _getPseudoContext(token, lineTillCursor, ctx);

        // If we are not able to find context, don't proceed
        if (this.context === -1) {
            return null;
        }

        this.token = token;

        // Filter the property list based on the token string
        var result = Object.keys(this.context === TOKEN_TYPE_PSEUDO_CLASS ? PseudoRules.classes : PseudoRules.elements).filter(function (key) {
            if (key.indexOf(filter) === 0) {
                return key;
            }
        }).sort();

        return {
            hints: result,
            match: filter,
            selectInitial: true,
            defaultDescriptionWidth: true,
            handleWideResults: false
        };
    };

    /**
     * Inserts a given ':<pseudo>' hint into the current editor context.
     *
     * @param {string} completion
     * The hint to be inserted into the editor context.
     *
     * @return {boolean}
     * Indicates whether the manager should follow hint insertion with an
     * additional explicit hint request.
     */
    PseudoSelectorHints.prototype.insertHint = function (completion) {
        var cursor = this.editor.getCursorPos();
        var startPos = {line: cursor.line, ch: this.token.start},
            endPos   = {line: cursor.line, ch: this.token.end};

        if (this.token.state.state === "pseudo") {
            // We have just started the 'pseudo' context, start replacing the current token by leaving ':' char
            startPos.ch = startPos.ch + 1;
            endPos = startPos;
        }

        if (this.context === TOKEN_TYPE_PSEUDO_CLASS) {
            // If the hint label contains annotated data for illustration, then we might have
            // different text to be inserted.
            completion = PseudoRules.classes[completion].text || completion;
        }

        this.editor.document.replaceRange(completion, startPos, endPos);

        if (completion.slice(-1) === ")") {
            cursor = this.editor.getCursorPos();
            this.editor.setCursorPos({line: cursor.line, ch: cursor.ch - 1});
        }

        return false;
    };

    AppInit.appReady(function () {
        // Register code hint providers
        var pseudoSelectorHints = new PseudoSelectorHints();
        CodeHintManager.registerHintProvider(pseudoSelectorHints, ["css", "scss", "less"], 0);

        // For test
        exports.pseudoSelectorHints = pseudoSelectorHints;
    });
});
