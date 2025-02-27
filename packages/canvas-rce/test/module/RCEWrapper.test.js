/*
 * Copyright (C) 2018 - present Instructure, Inc.
 *
 * This file is part of Canvas.
 *
 * Canvas is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, version 3 of the License.
 *
 * Canvas is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 * A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
 * details.
 *
 * You should have received a copy of the GNU Affero General Public License along
 * with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import assert from 'assert'
import sinon from 'sinon'
import Bridge from '../../src/bridge'
import * as indicateModule from '../../src/common/indicate'
import * as contentInsertion from '../../src/rce/contentInsertion'

import RCEWrapper, {
  mergeMenuItems,
  mergeMenu,
  mergeToolbar,
  mergePlugins,
  parsePluginsToExclude,
} from '../../src/rce/RCEWrapper'

const textareaId = 'myUniqId'

let React, fakeTinyMCE, editorCommandSpy, sd, editor

// ====================
//        HELPERS
// ====================

function requireReactDeps() {
  React = require('react')
  sd = require('skin-deep')
}

function createBasicElement(opts) {
  if (opts && opts.textareaId) {
    // so RCEWrapper.mceInstance() works
    fakeTinyMCE.editors[0].id = opts.textareaId
  }
  const props = {textareaId, tinymce: fakeTinyMCE, ...trayProps(), ...defaultProps(), ...opts}
  return new RCEWrapper(props)
}

function createdMountedElement(additionalProps = {}) {
  const tree = sd.shallowRender(
    React.createElement(RCEWrapper, {
      defaultContent: 'an example string',
      textareaId,
      tinymce: fakeTinyMCE,
      editorOptions: {},
      liveRegion: () => document.getElementById('flash_screenreader_holder'),
      canUploadFiles: false,
      ...trayProps(),
      features: {
        new_equation_editor: true,
      },
      ...additionalProps,
    })
  )
  return tree
}

function trayProps() {
  return {
    trayProps: {
      canUploadFiles: true,
      host: 'rcs.host',
      jwt: 'donotlookatme',
      contextType: 'course',
      contextId: '17',
      containingContext: {
        userId: '1',
        contextType: 'course',
        contextId: '17',
      },
    },
  }
}

// many of the tests call `new RCEWrapper`, so there's no React
// to provide the default props
function defaultProps() {
  return {
    textareaId,
    highContrastCSS: [],
    languages: [{id: 'en', label: 'English'}],
    autosave: {enabled: false},
    ltiTools: [],
    editorOptions: {},
    liveRegion: () => document.getElementById('flash_screenreader_holder'),
    features: {
      new_equation_editor: true,
    },
    canvasOrigin: 'http://canvas.docker',
  }
}

describe('RCEWrapper', () => {
  // ====================
  //   SETUP & TEARDOWN
  // ====================
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="flash_screenreader_holder" role="alert"/>
      <div id="app">
        <textarea id="${textareaId}" />
      </div>
    `
    document.documentElement.dir = 'ltr'

    // mock MutationObserver
    if (!global.MutationObserver) {
      global.MutationObserver = function MutationObserver(_props) {
        this.observe = () => {}
      }
    }

    if (!global.ResizeObserver) {
      global.ResizeObserver = function ResizeObserver() {
        this.observe = () => {}
        this.unobserve = () => {}
      }
    }

    requireReactDeps()
    editorCommandSpy = sinon.spy()
    editor = {
      content: 'I got called with: ',
      id: textareaId,
      dom: {
        getParent: () => {
          return null
        },
        decode: input => {
          return input
        },
        isEmpty: () => editor.content.length === 0,
        remove: elem => {
          elem.remove()
        },
        doc: document,
      },
      selection: {
        getEnd: () => {
          return 0
        },
        getNode: () => {
          const div = document.createElement('div')
          document.body.appendChild(div)
          return div
        },
        getContent: () => {
          return ''
        },
        collapse: () => undefined,
      },
      undoManager: {
        ignore: fn => fn(),
      },
      insertContent: contentToInsert => {
        editor.content += contentToInsert
      },
      getContainer: () => {
        return {
          style: {
            height: 300,
          },
        }
      },
      setContent: sinon.spy(c => (editor.content = c)),
      getContent: () => editor.content,
      getBody: () => editor.content,
      hidden: false,
      hide: () => (editor.hidden = true),
      show: () => (editor.hidden = false),
      isHidden: () => {
        return editor.hidden
      },
      execCommand: editorCommandSpy,
      serializer: {serialize: sinon.stub()},
      ui: {registry: {addIcon: () => {}}},
      isDirty: () => false,
      fire: () => {},
    }

    fakeTinyMCE = {
      triggerSave: () => 'called',
      execCommand: () => 'command executed',
      // plugins
      create: () => {},
      PluginManager: {
        add: () => {},
      },
      plugins: {
        AccessibilityChecker: {},
      },
      editors: [editor],
    }
    global.tinymce = fakeTinyMCE

    sinon.spy(editor, 'insertContent')
  })

  afterEach(function () {
    document.body.innerHTML = ''
  })

  // ====================
  //        TESTS
  // ====================

  describe('static methods', () => {
    describe('getByEditor', () => {
      it('gets instances by rendered tinymce object reference', () => {
        const editor_ = {
          ui: {registry: {addIcon: () => {}}},
        }
        const wrapper = new RCEWrapper({tinymce: fakeTinyMCE, ...trayProps(), ...defaultProps()})
        const options = wrapper.wrapOptions({})
        options.setup(editor_)
        assert.equal(RCEWrapper.getByEditor(editor_), wrapper)
      })
    })
  })

  describe('tinyMCE instance interactions', () => {
    let element

    beforeEach(() => {
      element = createBasicElement()
    })

    it('syncs content during toggle if coming back from hidden instance', () => {
      element = createdMountedElement().getMountedInstance()
      editor.hidden = true
      document.getElementById(textareaId).value = 'Some Input HTML'
      element.toggleView()
      assert.equal(element.getCode(), 'Some Input HTML')
    })

    it('emits "ViewChange" on view changes', () => {
      const fireSpy = sinon.spy()
      const fire = element.mceInstance().fire

      element.mceInstance().fire = fireSpy
      element.toggleView()

      assert(fireSpy.calledWith('ViewChange'))

      element.mceInstance().fire = fire
    })

    it('calls focus on its tinyMCE instance', () => {
      element = createBasicElement({textareaId: 'myOtherUniqId'})
      element.focus()
      assert(editorCommandSpy.withArgs('mceFocus', false).called)
    })

    it('calls handleUnmount when destroyed', () => {
      const handleUnmount = sinon.spy()
      element = createBasicElement({handleUnmount})
      element.destroy()
      sinon.assert.called(handleUnmount)
    })

    it("doesn't reset the doc for other commands", () => {
      element.toggleView()
      assert(!editorCommandSpy.calledWith('mceNewDocument'))
    })

    it('proxies hidden checks to editor', () => {
      assert.equal(element.isHidden(), false)
    })
  })

  describe('calling methods dynamically', () => {
    it('pipes arguments to specified method', () => {
      const element = createBasicElement()
      sinon.stub(element, 'set_code')
      element.call('set_code', 'new content')
      assert(element.set_code.calledWith('new content'))
    })

    it("handles 'exists?'", () => {
      const element = createBasicElement()
      sinon.stub(element, 'set_code')
      assert(element.call('exists?'))
    })
  })

  describe('getting and setting content', () => {
    let instance

    beforeEach(() => {
      instance = createdMountedElement().getMountedInstance()
      // no rce ref since it is a shallow render
      instance.refs = {}
      instance.refs.rce = {forceUpdate: () => 'no op'}
      instance.indicator = () => {}

      sinon.stub(instance, 'iframe').value({
        contentDocument: {
          body: {
            clientWidth: 500,
          },
        },
      })
    })

    afterEach(() => {
      editor.content = 'I got called with: '
    })

    it('sets code properly', () => {
      const expected = 'new content'
      instance.setCode(expected)
      sinon.assert.calledWith(editor.setContent, expected)
    })

    it('gets code properly', () => {
      assert.equal(editor.getContent(), instance.getCode())
    })
    it('inserts code properly', () => {
      const code = {}
      sinon.stub(contentInsertion, 'insertContent')
      instance.insertCode(code)
      assert.ok(contentInsertion.insertContent.calledWith(editor, code))
      contentInsertion.insertContent.restore()
    })

    it('inserts links', () => {
      const link = {}
      sinon.stub(contentInsertion, 'insertLink')
      instance.insertLink(link)
      assert.ok(contentInsertion.insertLink.calledWith(editor, link))
      contentInsertion.insertLink.restore()
    })

    it('inserts math equations', async () => {
      const tex = 'y = x^2'
      sinon.stub(contentInsertion, 'insertEquation')
      await instance.insertMathEquation(tex)
      sinon.assert.calledWith(contentInsertion.insertEquation, editor, tex)
    })

    describe('checkReadyToGetCode', () => {
      afterEach(() => {
        editor.dom.doc.body.innerHTML = ''
      })
      it('returns true if there are no elements with data-placeholder-for attributes', () => {
        assert.ok(instance.checkReadyToGetCode(() => {}))
      })

      it('calls promptFunc if there is an element with data-placeholder-for attribute', () => {
        const placeholder = document.createElement('img')
        placeholder.setAttribute('data-placeholder-for', 'image1')
        editor.dom.doc.body.appendChild(placeholder)
        const spy = sinon.spy()
        instance.checkReadyToGetCode(spy)
        sinon.assert.calledWith(
          spy,
          'Content is still being uploaded, if you continue it will not be embedded properly.'
        )
      })

      it('returns true if promptFunc returns true', () => {
        const placeholder = document.createElement('img')
        placeholder.setAttribute('data-placeholder-for', 'image1')
        editor.dom.doc.body.appendChild(placeholder)
        const stub = sinon.stub().returns(true)
        assert.ok(instance.checkReadyToGetCode(stub))
      })

      it('returns false if promptFunc returns false', () => {
        const placeholder = document.createElement('img')
        placeholder.setAttribute('data-placeholder-for', 'image1')
        editor.dom.doc.body.appendChild(placeholder)
        const stub = sinon.stub().returns(false)
        assert.ok(!instance.checkReadyToGetCode(stub))
      })
    })

    describe('insertImagePlaceholder', () => {
      let globalImage
      function mockImage(props) {
        // mock enough for RCEWrapper.insertImagePlaceholder
        globalImage = global.Image
        global.Image = function () {
          const img = {
            _src: null,
            width: '10',
            height: '10',
            ...props,
            get src() {
              return this._src
            },
            // when the src is set, wait a tick then call the onload handler
            set src(newSrc) {
              this._src = newSrc
              window.setTimeout(() => this.onload(), 1)
            },
          }
          return img
        }
      }
      function restoreImage() {
        global.Image = globalImage
      }

      it('inserts a placeholder image with the proper metadata', async () => {
        mockImage()
        const greenSquare =
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFElEQVR42mNk+A+ERADGUYX0VQgAXAYT9xTSUocAAAAASUVORK5CYII='
        const props = {
          name: 'green_square',
          domObject: {
            preview: greenSquare,
          },
          contentType: 'image/png',
        }

        const imageMarkup = `
<span
  aria-label="Loading"
  data-placeholder-for="green_square"
  style="width: 10px; height: 10px; vertical-align: middle;"
>`
        await instance.insertImagePlaceholder(props)
        sinon.assert.calledWith(
          editorCommandSpy,
          'mceInsertContent',
          false,
          sinon.match(imageMarkup)
        )
        restoreImage()
      })

      it('inserts a placeholder image with an encoded name to prevent nested quotes', async () => {
        mockImage()
        const greenSquare =
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFElEQVR42mNk+A+ERADGUYX0VQgAXAYT9xTSUocAAAAASUVORK5CYII='
        const props = {
          name: 'filename "with" quotes',
          domObject: {
            preview: greenSquare,
          },
          contentType: 'image/png',
        }

        const imageMarkup = `
<span
  aria-label="Loading"
  data-placeholder-for="filename%20%22with%22%20quotes"
  style="width: 10px; height: 10px; vertical-align: middle;"
>`
        await instance.insertImagePlaceholder(props)
        sinon.assert.calledWith(
          editorCommandSpy,
          'mceInsertContent',
          false,
          sinon.match(imageMarkup)
        )
        restoreImage()
      })

      it('constrains the image placeholder to the width of the rce', async () => {
        mockImage({width: 1000, height: 1000})
        const greenSquare =
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFElEQVR42mNk+A+ERADGUYX0VQgAXAYT9xTSUocAAAAASUVORK5CYII='
        const props = {
          name: 'green_square',
          domObject: {
            preview: greenSquare,
          },
          contentType: 'image/png',
        }

        const imageMarkup = `
<span
  aria-label="Loading"
  data-placeholder-for="green_square"
  style="width: 500px; height: 500px; vertical-align: middle;"
>`
        await instance.insertImagePlaceholder(props)
        sinon.assert.calledWith(
          editorCommandSpy,
          'mceInsertContent',
          false,
          sinon.match(imageMarkup)
        )
        restoreImage()
      })

      it('inserts a text file placeholder image with the proper metadata', async () => {
        const props = {
          name: 'file.txt',
          domObject: {},
          contentType: 'text/plain',
        }

        const imageMarkup = `
<span
  aria-label="Loading"
  data-placeholder-for="file.txt"
  style="width: 8rem; height: 1rem; vertical-align: middle;"
>`
        await instance.insertImagePlaceholder(props)
        sinon.assert.calledWith(
          editorCommandSpy,
          'mceInsertContent',
          false,
          sinon.match(imageMarkup)
        )
      })

      it('inserts a video file placeholder image with the proper metadata', async () => {
        const props = {
          name: 'file.mov',
          domObject: {},
          contentType: 'video/quicktime',
        }
        const imageMarkup = `
<span
  aria-label="Loading"
  data-placeholder-for="file.mov"
  style="width: 400px; height: 225px; vertical-align: bottom;"
>`
        await instance.insertImagePlaceholder(props)
        sinon.assert.calledWith(
          editorCommandSpy,
          'mceInsertContent',
          false,
          sinon.match(imageMarkup)
        )
      })

      it('inserts an audio file placeholder image with the proper metadata', async () => {
        const props = {
          name: 'file.mp3',
          domObject: {},
          contentType: 'audio/mp3',
        }
        const imageMarkup = `
<span
  aria-label="Loading"
  data-placeholder-for="file.mp3"
  style="width: 320px; height: 14.25rem; vertical-align: bottom;"
>`
        await instance.insertImagePlaceholder(props)
        sinon.assert.calledWith(
          editorCommandSpy,
          'mceInsertContent',
          false,
          sinon.match(imageMarkup)
        )
      })

      it('inserts a little placeholder for images displayed as links', async () => {
        mockImage()
        const square =
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFElEQVR42mNk+A+ERADGUYX0VQgAXAYT9xTSUocAAAAASUVORK5CYII='
        const props = {
          name: 'square.png',
          domObject: {
            preview: square,
          },
          contentType: 'image/png',
          displayAs: 'link',
        }

        const imageMarkup = `
<span
  aria-label="Loading"
  data-placeholder-for="square.png"
  style="width: 10rem; height: 1rem; vertical-align: middle;"
>`
        await instance.insertImagePlaceholder(props)
        sinon.assert.calledWith(
          editorCommandSpy,
          'mceInsertContent',
          false,
          sinon.match(imageMarkup)
        )
        restoreImage()
      })
    })

    describe('removePlaceholders', () => {
      it('removes placeholders that match the given name', () => {
        const placeholder = document.createElement('img')
        placeholder.setAttribute('data-placeholder-for', 'image1')
        editor.dom.doc.body.appendChild(placeholder)
        instance.removePlaceholders('image1')
        assert.ok(!editor.dom.doc.querySelector(`[data-placeholder-for="image1"]`))
      })

      it('does not remove placeholders that do not match the given name', () => {
        const placeholder = document.createElement('img')
        placeholder.setAttribute('data-placeholder-for', 'image1')
        const placeholder2 = document.createElement('img')
        placeholder2.setAttribute('data-placeholder-for', 'image2')
        editor.dom.doc.body.appendChild(placeholder2)
        instance.removePlaceholders('image1')
        assert.ok(!editor.dom.doc.querySelector(`[data-placeholder-for="image1"]`))
        assert.ok(editor.dom.doc.querySelector(`[data-placeholder-for="image2"]`))
      })
    })

    describe('insert image', () => {
      it('works when no element is returned from content insertion', () => {
        sinon.stub(contentInsertion, 'insertImage').returns(null)
        instance.insertImage({})
        contentInsertion.insertImage.restore()
      })

      it("removes TinyMCE's caret &nbsp; when element is returned from content insertion", () => {
        const container = document.createElement('div')
        container.innerHTML = '<div><img src="image.jpg" alt="test" />&nbsp;</div>'
        const element = container.querySelector('img')
        const removeSpy = sinon.spy(element.nextSibling, 'remove')
        sinon.stub(contentInsertion, 'insertImage').returns(element)
        instance.insertImage({})
        contentInsertion.insertImage.restore()
        assert(removeSpy.called)
      })
    })

    describe('insert media', () => {
      let insertedSpy

      beforeEach(() => {
        insertedSpy = sinon.spy(instance, 'contentInserted')
      })

      afterEach(() => {
        instance.contentInserted.restore()
      })

      it('inserts video', () => {
        sinon.stub(contentInsertion, 'insertVideo').returns('<iframe/>')
        instance.insertVideo({})
        assert.equal(insertedSpy.getCall(0).args[0], '<iframe/>')
      })

      it('inserts audio', () => {
        sinon.stub(contentInsertion, 'insertAudio').returns('<iframe/>')
        instance.insertAudio({})
        assert.equal(insertedSpy.getCall(0).args[0], '<iframe/>')
      })

      it('inserts embed code', () => {
        instance.insertEmbedCode('embed me!')
        assert(insertedSpy.called)
      })
    })

    describe('indicator', () => {
      it('does not indicate() if editor is hidden', () => {
        const indicateDefaultStub = sinon.stub(indicateModule, 'default')
        editor.hidden = true
        sinon.stub(instance, 'mceInstance')
        instance.mceInstance.returns(editor)
        instance.indicateEditor(null)
        assert.ok(indicateDefaultStub.neverCalledWith())
        indicateModule.default.restore()
      })

      it('waits until images are loaded to indicate', () => {
        const image = {complete: false}
        sinon.spy(instance, 'indicateEditor')
        sinon.stub(contentInsertion, 'insertImage').returns(image)
        instance.insertImage(image)
        assert.ok(instance.indicateEditor.notCalled)
        image.onload()
        assert.ok(instance.indicateEditor.called)
        contentInsertion.insertImage.restore()
      })
    })

    describe('broken images', () => {
      it('calls checkImageLoadError when complete', () => {
        const image = {complete: true}
        sinon.spy(instance, 'checkImageLoadError')
        sinon.stub(contentInsertion, 'insertImage').returns(image)
        instance.insertImage(image)
        assert.ok(instance.checkImageLoadError.called)
        instance.checkImageLoadError.restore()
        contentInsertion.insertImage.restore()
      })

      it('sets an onerror handler when not complete', () => {
        const image = {complete: false}
        sinon.spy(instance, 'checkImageLoadError')
        sinon.stub(contentInsertion, 'insertImage').returns(image)
        instance.insertImage(image)
        assert.ok(typeof image.onerror === 'function')
        image.onerror()
        assert.ok(instance.checkImageLoadError.called)
        instance.checkImageLoadError.restore()
        contentInsertion.insertImage.restore()
      })

      describe('checkImageLoadError', () => {
        it('does not error if called without an element', () => {
          instance.checkImageLoadError()
        })

        it('does not error if called without a non-image element', () => {
          const div = {tagName: 'DIV'}
          instance.checkImageLoadError(div)
        })

        it('checks onload for images not done loading', done => {
          const fakeElement = {
            complete: false,
            tagName: 'IMG',
            naturalWidth: 0,
            style: {},
          }
          instance.checkImageLoadError(fakeElement)
          assert.equal(Object.keys(fakeElement.style).length, 0)
          fakeElement.complete = true
          fakeElement.onload()
          setTimeout(() => {
            try {
              assert.ok(fakeElement.style.border === '1px solid #000')
              assert.ok(fakeElement.style.padding === '2px')
              done()
            } catch (err) {
              done(err)
            }
          }, 0)
        })

        it('sets the proper styles when the naturalWidth is 0', done => {
          const fakeElement = {
            complete: true,
            tagName: 'IMG',
            naturalWidth: 0,
            style: {},
          }
          instance.checkImageLoadError(fakeElement)
          setTimeout(() => {
            try {
              assert.ok(fakeElement.style.border === '1px solid #000')
              assert.ok(fakeElement.style.padding === '2px')
              done()
            } catch (err) {
              done(err)
            }
          }, 0)
        })
      })
    })
  })

  describe('alias functions', () => {
    it('sets aliases properly', () => {
      const element = createBasicElement()
      const aliases = {
        set_code: 'setCode',
        get_code: 'getCode',
        insert_code: 'insertCode',
      }
      Object.keys(aliases).forEach(k => {
        const v = aliases[k]
        assert(element[v], element[k])
      })
    })
  })

  describe('is_dirty()', () => {
    it('is true if not hidden and defaultContent is not equal to getConent()', () => {
      editor.serializer.serialize.returns(editor.content)
      const c = createBasicElement()
      c.setCode('different')
      editor.hidden = false
      assert(c.is_dirty())
    })

    it('is false if not hidden and defaultContent is equal to getConent()', () => {
      editor.serializer.serialize.returns(editor.content)
      const c = createBasicElement()
      editor.hidden = false
      assert(!c.is_dirty())
    })

    it('is true if hidden and defaultContent is not equal to textarea value', () => {
      const c = createBasicElement({textareaId, defaultContent: 'default'})
      editor.hidden = true
      document.getElementById(textareaId).value = 'different'
      assert(c.is_dirty())
    })

    it('is false if hidden and defaultContent is equal to textarea value', () => {
      const defaultContent = 'default content'
      editor.serializer.serialize.returns(defaultContent)
      const c = createBasicElement({textareaId, defaultContent, editorView: 'RAW'})
      editor.hidden = true
      document.getElementById(textareaId).value = defaultContent
      assert(!c.is_dirty())
    })

    it('compares content with defaultContent serialized by editor serializer', () => {
      editor.serializer.serialize.returns(editor.content)
      const defaultContent = 'foo'
      const c = createBasicElement({defaultContent})
      editor.hidden = false
      assert(!c.is_dirty())
      sinon.assert.calledWithExactly(
        editor.serializer.serialize,
        sinon.match(
          el => el.innerHTML === defaultContent,
          `div with "${defaultContent}" as inner html`
        ),
        {getInner: true}
      )
    })
  })

  describe('onFocus', () => {
    beforeEach(() => {
      sinon.stub(Bridge, 'focusEditor')
    })

    afterEach(() => {
      Bridge.focusEditor.restore()
    })

    it('calls Bridge.focusEditor with editor', () => {
      const editor_ = createBasicElement()
      editor_.handleFocus()
      sinon.assert.calledWith(Bridge.focusEditor, editor_)
    })

    it('calls props.onFocus with editor if exists', () => {
      const editor_ = createBasicElement({onFocus: sinon.spy()})
      editor_.handleFocus()
      sinon.assert.calledWith(editor_.props.onFocus, editor_)
    })
  })

  describe('onRemove', () => {
    beforeEach(() => {
      sinon.stub(Bridge, 'detachEditor')
    })

    afterEach(() => {
      Bridge.detachEditor.restore()
    })

    it('calls Bridge.detachEditor with editor', () => {
      const editor_ = createBasicElement()
      editor_.onRemove()
      sinon.assert.calledWith(Bridge.detachEditor, editor_)
    })

    it('calls props.onRemove with editor_ if exists', () => {
      const editor_ = createBasicElement({onRemove: sinon.spy()})
      editor_.onRemove()
      sinon.assert.calledWith(editor_.props.onRemove, editor_)
    })
  })

  describe('setup option', () => {
    let editorOptions

    beforeEach(() => {
      editorOptions = {
        setup: sinon.spy(),
        other: {},
      }
    })

    it('registers editor to allow getting wrapper by editor', () => {
      const editor_ = {ui: {registry: {addIcon: () => {}}}}
      const tree = createdMountedElement({editorOptions})
      tree.subTree('Editor').props.init.setup(editor_)
      assert.equal(RCEWrapper.getByEditor(editor_), tree.getMountedInstance())
    })

    it('it calls original setup from editorOptions', () => {
      const editor_ = {ui: {registry: {addIcon: () => {}}}}
      const spy = editorOptions.setup
      const tree = createdMountedElement({editorOptions})
      tree.subTree('Editor').props.init.setup(editor_)
      sinon.assert.calledWithExactly(spy, editor_)
    })

    it('does not throw if options does not have a setup function', () => {
      delete editorOptions.setup
      createdMountedElement({editorOptions})
    })

    it('passes other options through unchanged', () => {
      const tree = createdMountedElement({editorOptions})
      tree.subTree('Editor').props.init.setup(editor)
      assert.equal(tree.subTree('Editor').props.init.other, editorOptions.other)
    })
  })

  describe('textarea', () => {
    let instance, elem

    function stubEventListeners(elm) {
      sinon.stub(elm, 'addEventListener')
      sinon.stub(elm, 'removeEventListener')
    }

    beforeEach(() => {
      instance = createBasicElement()
      elem = document.getElementById(textareaId)
      stubEventListeners(elem)
      sinon.stub(instance, 'doAutoSave')
    })

    describe('handleTextareaChange', () => {
      it('updates the editor content if editor is hidden', () => {
        const value = 'foo'
        elem.value = value
        editor.hidden = true
        instance.handleTextareaChange()
        sinon.assert.calledWith(editor.setContent, value)
        sinon.assert.called(instance.doAutoSave)
      })

      it('does not update the editor if editor is not hidden', () => {
        editor.hidden = false
        instance.handleTextareaChange()
        sinon.assert.notCalled(editor.setContent)
        sinon.assert.notCalled(instance.doAutoSave)
      })
    })
  })

  describe('alert area', () => {
    it('adds an alert and attaches an id when addAlert is called', () => {
      const tree = createdMountedElement()
      const rce = tree.getMountedInstance()
      rce.resetAlertId()
      rce.addAlert({
        text: 'Something went wrong uploading, check your connection and try again.',
        variant: 'error',
      })
      assert.ok(rce.state.messages[0].id === 0)
      const alertArea = tree.dive(['AlertMessageArea'])
      const alerts = alertArea.everySubTree('Alert')
      assert.ok(alerts.length === 1)
    })

    it('adds multiple alerts', () => {
      const tree = createdMountedElement()
      const rce = tree.getMountedInstance()
      rce.resetAlertId()
      rce.addAlert({
        text: 'Something went wrong uploading, check your connection and try again.',
        variant: 'error',
      })
      rce.addAlert({
        text: 'Something went wrong uploading 2, check your connection and try again.',
        variant: 'error',
      })
      rce.addAlert({
        text: 'Something went wrong uploading 3, check your connection and try again.',
        variant: 'error',
      })
      const alertArea = tree.dive(['AlertMessageArea'])
      const alerts = alertArea.everySubTree('Alert')
      assert.ok(alerts.length === 3)
    })

    it('does not add alerts with the exact same text', () => {
      const tree = createdMountedElement()
      const rce = tree.getMountedInstance()
      rce.resetAlertId()
      rce.addAlert({
        text: 'Something went wrong uploading, check your connection and try again.',
        variant: 'error',
      })
      rce.addAlert({
        text: 'Something went wrong uploading, check your connection and try again.',
        variant: 'error',
      })
      rce.addAlert({
        text: 'Something went wrong uploading, check your connection and try again.',
        variant: 'error',
      })
      const alertArea = tree.dive(['AlertMessageArea'])
      const alerts = alertArea.everySubTree('Alert')
      assert.ok(alerts.length === 1)
    })

    it('removes an alert when removeAlert is called', () => {
      const tree = createdMountedElement()
      const rce = tree.getMountedInstance()
      rce.resetAlertId()
      rce.addAlert({
        text: 'First',
        variant: 'error',
      })
      rce.addAlert({
        text: 'Second',
        variant: 'error',
      })
      rce.addAlert({
        text: 'Third',
        variant: 'error',
      })
      rce.removeAlert(1)
      const alertArea = tree.dive(['AlertMessageArea'])
      const alerts = alertArea.everySubTree('Alert')
      assert.ok(alerts.length === 2)
    })
  })

  describe('wrapOptions', () => {
    it('includes instructure_record in plugins if not instRecordDisabled', () => {
      const wrapper = new RCEWrapper({
        tinymce: fakeTinyMCE,
        ...trayProps(),
        ...defaultProps(),
        instRecordDisabled: false,
      })
      const options = wrapper.wrapOptions({})
      assert.ok(options.plugins.indexOf('instructure_record') >= 0)
    })

    it('instructure_record not in plugins if instRecordDisabled is set', () => {
      const wrapper = new RCEWrapper({
        tinymce: fakeTinyMCE,
        ...trayProps(),
        ...defaultProps(),
        instRecordDisabled: true,
      })
      const options = wrapper.wrapOptions({})
      assert.strictEqual(options.plugins.indexOf('instructure_record'), -1)
    })
  })

  describe('Extending the toolbar and menus', () => {
    const sleazyDeepCopy = a => JSON.parse(JSON.stringify(a))

    describe('mergeMenuItems', () => {
      it('returns input if no custom commands are provided', () => {
        const a = 'foo bar | baz'
        const c = mergeMenuItems(a)
        assert.strictEqual(c, a)
      })

      it('merges 2 lists of commands', () => {
        const a = 'foo bar | baz'
        const b = 'fizz buzz'
        const c = mergeMenuItems(a, b)
        assert.strictEqual(c, 'foo bar | baz | fizz buzz')
      })

      it('respects the | grouping separator', () => {
        const a = 'foo bar | baz'
        const b = 'fizz | buzz'
        const c = mergeMenuItems(a, b)
        assert.strictEqual(c, 'foo bar | baz | fizz | buzz')
      })

      it('removes duplicates and strips trailing |', () => {
        const a = 'foo bar | baz'
        const b = 'fizz buzz | baz'
        const c = mergeMenuItems(a, b)
        assert.strictEqual(c, 'foo bar | baz | fizz buzz')
      })

      it('removes duplicates and strips leading |', () => {
        const a = 'foo bar | baz'
        const b = 'baz | fizz buzz '
        const c = mergeMenuItems(a, b)
        assert.strictEqual(c, 'foo bar | baz | fizz buzz')
      })
    })

    describe('mergeMenus', () => {
      let standardMenu
      beforeEach(() => {
        standardMenu = {
          format: {
            items: 'bold italic underline | removeformat',
            title: 'Format',
          },
          insert: {
            items: 'instructure_links | inserttable instructure_media_embed | hr',
            title: 'Insert',
          },
          tools: {
            items: 'instructure_wordcount',
            title: 'Tools',
          },
        }
      })
      it('returns input if no custom menus are provided', () => {
        const a = sleazyDeepCopy(standardMenu)
        assert.deepStrictEqual(mergeMenu(a), standardMenu)
      })

      it('merges items into an existing menu', () => {
        const a = sleazyDeepCopy(standardMenu)
        const b = {
          tools: {
            items: 'foo bar',
          },
        }
        const result = sleazyDeepCopy(standardMenu)
        result.tools.items = 'instructure_wordcount | foo bar'
        assert.deepStrictEqual(mergeMenu(a, b), result)
      })

      it('adds a new menu', () => {
        const a = sleazyDeepCopy(standardMenu)
        const b = {
          new_menu: {
            title: 'New Menu',
            items: 'foo bar',
          },
        }
        const result = sleazyDeepCopy(standardMenu)
        result.new_menu = {
          items: 'foo bar',
          title: 'New Menu',
        }
        assert.deepStrictEqual(mergeMenu(a, b), result)
      })

      it('merges items _and_ adds a new menu', () => {
        const a = sleazyDeepCopy(standardMenu)
        const b = {
          tools: {
            items: 'foo bar',
          },
          new_menu: {
            title: 'New Menu',
            items: 'foo bar',
          },
        }
        const result = sleazyDeepCopy(standardMenu)
        result.tools.items = 'instructure_wordcount | foo bar'
        result.new_menu = {
          items: 'foo bar',
          title: 'New Menu',
        }
        assert.deepStrictEqual(mergeMenu(a, b), result)
      })
    })

    describe('mergeToolbar', () => {
      let standardToolbar
      beforeEach(() => {
        standardToolbar = [
          {
            items: ['fontsizeselect', 'formatselect'],
            name: 'Styles',
          },
          {
            items: ['bold', 'italic', 'underline'],
            name: 'Formatting',
          },
        ]
      })

      it('returns input if no custom toolbars are provided', () => {
        const a = sleazyDeepCopy(standardToolbar)
        assert.deepStrictEqual(mergeToolbar(a), standardToolbar)
      })

      it('merges items into the toolbar', () => {
        const a = sleazyDeepCopy(standardToolbar)
        const b = [
          {
            name: 'Formatting',
            items: ['foo', 'bar'],
          },
        ]
        const result = sleazyDeepCopy(standardToolbar)
        result[1].items = ['bold', 'italic', 'underline', 'foo', 'bar']
        assert.deepStrictEqual(mergeToolbar(a, b), result)
      })

      it('adds a new toolbar if necessary', () => {
        const a = sleazyDeepCopy(standardToolbar)
        const b = [
          {
            name: 'I Am New',
            items: ['foo', 'bar'],
          },
        ]
        const result = sleazyDeepCopy(standardToolbar)
        result[2] = {
          items: ['foo', 'bar'],
          name: 'I Am New',
        }
        assert.deepStrictEqual(mergeToolbar(a, b), result)
      })

      it('merges toolbars and adds a new one', () => {
        const a = sleazyDeepCopy(standardToolbar)
        const b = [
          {
            name: 'Formatting',
            items: ['foo', 'bar'],
          },
          {
            name: 'I Am New',
            items: ['foo', 'bar'],
          },
        ]
        const result = sleazyDeepCopy(standardToolbar)
        result[1].items = ['bold', 'italic', 'underline', 'foo', 'bar']
        result[2] = {
          items: ['foo', 'bar'],
          name: 'I Am New',
        }
        assert.deepStrictEqual(mergeToolbar(a, b), result)
      })
    })

    describe('mergePlugins', () => {
      let standardPlugins
      beforeEach(() => {
        standardPlugins = ['foo', 'bar', 'baz']
      })

      it('returns input if no custom or excluded plugins are provided', () => {
        const standard = sleazyDeepCopy(standardPlugins)
        assert.deepStrictEqual(mergePlugins(standard), standard)
      })

      it('merges items into the plugins', () => {
        const standard = sleazyDeepCopy(standardPlugins)
        const custom = ['fizz', 'buzz']
        const result = standardPlugins.concat(custom)
        assert.deepStrictEqual(mergePlugins(standard, custom), result)
      })

      it('removes duplicates', () => {
        const standard = sleazyDeepCopy(standardPlugins)
        const custom = ['foo', 'fizz']
        const result = standardPlugins.concat(['fizz'])
        assert.deepStrictEqual(mergePlugins(standard, custom), result)
      })

      it('removes plugins marked to exlude', () => {
        const standard = sleazyDeepCopy(standardPlugins)
        const custom = ['foo', 'fizz']
        const exclusions = ['fizz', 'baz']
        const result = ['foo', 'bar']
        assert.deepStrictEqual(mergePlugins(standard, custom, exclusions), result)
      })
    })

    describe('configures menus', () => {
      it('includes instructure_media in plugins if not instRecordDisabled', () => {
        const instance = createBasicElement({instRecordDisabled: false})
        assert.ok(instance.tinymceInitOptions.plugins.includes('instructure_record'))
      })

      it('removes instructure_media from plugins if instRecordDisabled is set', () => {
        const instance = createBasicElement({instRecordDisabled: true})
        assert.ok(!instance.tinymceInitOptions.plugins.includes('instructure_record'))
      })
    })

    describe('parsePluginsToExclude', () => {
      it('returns cleaned versions of plugins prefixed with a hyphen', () => {
        const plugins = ['-abc', 'def', '-ghi', 'jkl']
        const result = ['abc', 'ghi']
        assert.deepStrictEqual(parsePluginsToExclude(plugins), result)
      })
    })
  })

  describe('lti tool favorites', () => {
    it('extracts favorites', () => {
      const element = createBasicElement({
        ltiTools: [
          {
            canvas_icon_class: null,
            description: 'the thing',
            favorite: true,
            height: 160,
            id: 1,
            name: 'A Tool',
            width: 340,
          },
          {
            canvas_icon_class: null,
            description: 'another thing',
            favorite: false,
            height: 600,
            id: 2,
            name: 'Not a favorite tool',
            width: 560,
          },
          {
            canvas_icon_class: null,
            description: 'another thing',
            favorite: true,
            height: 600,
            id: 3,
            name: 'Another Tool',
            width: 560,
          },
          {
            canvas_icon_class: null,
            description: 'yet another thing',
            favorite: true,
            height: 600,
            id: 4,
            name: 'Yet Another Tool',
            width: 560,
          },
        ],
      })

      assert.deepStrictEqual(element.ltiToolFavorites, [
        'instructure_external_button_1',
        'instructure_external_button_3',
      ])
    })
  })

  describe('limit the number or RCEs fully rendered on page load', () => {
    let ReactDOM
    before(() => {
      ReactDOM = require('react-dom')

      global.IntersectionObserver = function () {
        return {
          observe: () => {},
          disconnect: () => {},
        }
      }
    })
    beforeEach(() => {
      document.getElementById('app').innerHTML = `
        <div class='rce-wrapper'>faux rendered rce</div>
        <div class='rce-wrapper'>faux rendered rce</div>
        <div id="here"/>
      `
    })

    it('renders them all if no max is set', done => {
      ReactDOM.render(
        <RCEWrapper {...defaultProps()} tinymce={fakeTinyMCE} />,
        document.getElementById('here'),
        () => {
          assert.strictEqual(document.querySelectorAll('.rce-wrapper').length, 3)
          done()
        }
      )
    })

    it('renders them all if maxInitRenderedRCEs is <0', done => {
      ReactDOM.render(
        <RCEWrapper {...defaultProps()} tinymce={fakeTinyMCE} maxInitRenderedRCEs={-1} />,
        document.getElementById('here'),
        () => {
          assert.strictEqual(document.querySelectorAll('.rce-wrapper').length, 3)
          done()
        }
      )
    })

    it('limits them to maxInitRenderedRCEs value', done => {
      ReactDOM.render(
        <RCEWrapper {...defaultProps()} tinymce={fakeTinyMCE} maxInitRenderedRCEs={2} />,
        document.getElementById('here'),
        () => {
          assert.strictEqual(document.querySelectorAll('.rce-wrapper').length, 2)
          done()
        }
      )
    })

    it('copes with missing IntersectionObserver', done => {
      delete global.IntersectionObserver

      ReactDOM.render(
        <RCEWrapper {...defaultProps()} tinymce={fakeTinyMCE} maxInitRenderedRCEs={2} />,
        document.getElementById('here'),
        () => {
          assert.strictEqual(document.querySelectorAll('.rce-wrapper').length, 3)
          done()
        }
      )
    })
  })
})
