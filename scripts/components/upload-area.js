/**
 * Upload area element
 *
 * @description An element that accepts file uploads via drag-and-drop or file selection
 *
 * @element upload-area
 * @property {string} accepts - The file types accepted by the element
 * @fires fileenter - When a file is dragged over the element
 * @fires fileleave - When a file is dragged out of the element
 * @fires fileaccepted - When a file is accepted by the element
 * @fires filerejected - When a file is rejected by the element
 * @fires fileuploading - When the file is being uploaded
 * @fires fileuploaded - When the file is uploaded successfully
 * @fires fileuploaderror - When the file upload fails
 * @fires fileprogress - When the file upload progress changes
 */
class UploadArea extends HTMLElement {
  static observedAttributes = ["accepts", "disabled"];

  /** @type {HTMLFormElement | undefined | null} */
  #formElement;
  /** @type {HTMLInputElement | undefined} */
  #fileInput;
  /** @type {string[] | undefined} */
  #accepts;

  constructor() {
    super();
  }

  connectedCallback() {
    this.#formElement = this.closest("form");
    if (!this.#formElement) {
      throw new Error("<file-upload>: Parent form not found.");
    }

    this.#fileInput = document.createElement("input");
    this.#fileInput.setAttribute("type", "file");
    if (this.#accepts) {
      this.#fileInput.setAttribute("accept", this.#accepts.join(","));
    }

    const slot = document.createElement("slot");
    const shadow = this.attachShadow({ mode: "closed" });
    shadow.appendChild(slot);

    this.#addEventListeners();
  }

  disconnectedCallback() {
    this.#removeEventListeners();
  }

  /** @param {string} name
   ** @param {string} _
   ** @param {string} newValue **/
  attributeChangedCallback(name, _, newValue) {
    if (name === "accepts") {
      if (this.#fileInput) {
        this.#fileInput.setAttribute("accept", newValue);
      }
      this.#accepts = newValue.split(",");
    }
    if (name === "disabled") {
      if (newValue) {
        this.#removeEventListeners();
      } else {
        this.#addEventListeners();
      }
    }
  }

  #addEventListeners() {
    this.#fileInput?.addEventListener("change", this.#onFileInputChange);
    this.addEventListener("click", this.#onClick);
    this.addEventListener("dragenter", this.#onDragEnter);
    this.addEventListener("dragleave", this.#onDragLeave);
    this.addEventListener("drop", this.#onDrop);
    this.addEventListener("dragover", preventDefault);
  }

  #removeEventListeners() {
    this.#fileInput?.removeEventListener("change", this.#onFileInputChange);
    this.removeEventListener("click", this.#onClick);
    this.removeEventListener("dragenter", this.#onDragEnter);
    this.removeEventListener("dragleave", this.#onDragLeave);
    this.removeEventListener("drop", this.#onDrop);
    this.removeEventListener("dragover", preventDefault);
  }

  /** @param {Event} e **/
  #onClick = (e) => {
    e.preventDefault();
    this.#fileInput?.click();
  };

  /** @param {Event} e **/
  #onFileInputChange = (e) => {
    e.preventDefault();
    if (e.target instanceof HTMLInputElement) {
      const file = e.target.files?.[0];
      if (file && this.#isAcceptedFile(file)) {
        this.#processFile(file);
      }
    }
  };

  /** @param {DragEvent} e **/
  #onDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.items[0].getAsFile();
    if (file && this.#isAcceptedFile(file)) {
      this.#processFile(file);
    }
  };

  /** @param {DragEvent} e **/
  #onDragEnter = (e) => {
    e.preventDefault();
    const item = e.dataTransfer?.items[0];
    if (item) {
      this.dispatchEvent(
        new CustomEvent("fileenter", {
          detail: {
            accepted: this.#isAcceptedByFileType(item),
            file: item,
          },
        }),
      );
    }
  };

  #onDragLeave = () => {
    this.dispatchEvent(new CustomEvent("fileleave"));
  };

  /** @param {ProgressEvent} e **/
  #onFileUploadProgress = (e) => {
    if (e.lengthComputable) {
      const progress = Math.round((e.loaded / e.total) * 100);
      this.dispatchEvent(new CustomEvent("fileprogress", { detail: progress }));
    }
  };

  /** @param { File } f
   ** @returns {boolean} **/
  #isAcceptedFile(f) {
    if (this.#isAcceptedByFileExtension(f) || this.#isAcceptedByFileType(f)) {
      this.dispatchEvent(new CustomEvent("fileaccepted", { detail: f }));
      return true;
    } else {
      this.dispatchEvent(new CustomEvent("filerejected", { detail: f }));
      return false;
    }
  }

  /** @param { File } f
   ** @returns {boolean} **/
  #isAcceptedByFileExtension(f) {
    if (!this.#accepts) return true;
    const ext = f.name.split(".").pop();
    for (var i = 0; i < this.#accepts.length; i++) {
      const accept = this.#accepts[i].trim();
      if (ext === accept.substring(1)) {
        return true;
      }
    }
    return false;
  }

  /** @param { DataTransferItem | File } f
   ** @returns {boolean} **/
  #isAcceptedByFileType(f) {
    if (!this.#accepts) return true;

    for (var i = 0; i < this.#accepts.length; i++) {
      const accept = this.#accepts[i].trim();
      if (accept.includes("*")) {
        const prefix = accept.split("/")[0];
        if (f.type.startsWith(prefix)) {
          return true;
        }
      }
      if (f.type === accept) {
        return true;
      }
    }
    return false;
  }

  /** @param {File} f **/
  async #processFile(f) {
    this.dispatchEvent(new CustomEvent("fileuploading", { detail: f }));
    try {
      const req = await this.#uploadFile(f);
      this.dispatchEvent(
        new CustomEvent("fileuploaded", { detail: { file: f, path: req } }),
      );
    } catch (error) {
      this.dispatchEvent(
        new CustomEvent("fileuploaderror", { detail: { file: f, error } }),
      );
    }
  }

  /** @param {File} f
   ** @returns {Promise<string>} **/
  async #uploadFile(f) {
    const xhr = new XMLHttpRequest();
    const success = await new Promise((resolve, reject) => {
      if (this.#formElement) {
        xhr.upload.addEventListener("progress", this.#onFileUploadProgress);
        xhr.addEventListener("loadend", () => {
          if (xhr.status === 200 && xhr.readyState === 4) {
            resolve(xhr.response);
          } else {
            reject(xhr.response);
          }
        });
        xhr.open("PUT", this.#formElement.action, true);
        xhr.setRequestHeader("Content-Type", f.type);
        xhr.setRequestHeader("File-Name", f.name);
        xhr.send(f);
      } else {
        reject("Form element not found.");
      }
    });
    return success;
  }
}

/** @param {Event} e **/
function preventDefault(e) {
  e.preventDefault();
}

customElements.define("upload-area", UploadArea);
