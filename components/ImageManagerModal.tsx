import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Upload, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Editor } from '@tiptap/react';
import { imageStorageService, StoredImage, useResolvedImageUrl } from '../services/imageStorageService';

const ImageThumbnail: React.FC<{ img: StoredImage; onInsert: () => void }> = ({ img, onInsert }) => {
  const displaySrc = useResolvedImageUrl(img.url);
  return (
    <div
      className="aspect-video bg-gray-100 dark:bg-gray-600 cursor-pointer overflow-hidden flex items-center justify-center"
      onClick={onInsert}
      title="클릭하여 에디터에 삽입"
    >
      <img
        src={displaySrc}
        alt={img.filename}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
        loading="lazy"
      />
    </div>
  );
};

interface ImageManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  editor: Editor | null;
}

const ImageManagerModal: React.FC<ImageManagerModalProps> = ({ isOpen, onClose, editor }) => {
  const [images, setImages] = useState<StoredImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    try {
      const data = await imageStorageService.getStoredImages();
      setImages(data);
    } catch (e) {
      console.error('Failed to load images', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchImages();
    }
  }, [isOpen, fetchImages]);

  const handleDelete = async (filename: string) => {
    if (!window.confirm(`"${filename}" 이미지를 삭제하시겠습니까?`)) return;

    setDeleting(filename);
    try {
      const success = await imageStorageService.deleteStoredImage(filename);
      if (success) {
        setImages((prev) => prev.filter((img) => img.filename !== filename));
      } else {
        alert('이미지 삭제에 실패했습니다.');
      }
    } catch (e) {
      console.error('Failed to delete image', e);
      alert('이미지 삭제에 실패했습니다.');
    } finally {
      setDeleting(null);
    }
  };

  const handleInsert = (img: StoredImage) => {
    if (!editor) return;
    onClose();
    setTimeout(() => {
      editor
        .chain()
        .focus()
        .setImageBlock({
          src: img.url,
          alt: img.filename,
          title: img.filename,
        })
        .run();
    }, 10);
  };

  const handleUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      setUploading(true);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          await imageStorageService.compressAndStoreImage(file);
        } catch (err) {
          console.error('Failed to upload image:', file.name, err);
        }
      }
      setUploading(false);
      fetchImages();
    };
    input.click();
  };

  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <ImageIcon size={20} />
            이미지 관리
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              업로드
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-gray-400" />
            </div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <ImageIcon size={48} className="mb-3 opacity-40" />
              <p className="text-sm">업로드된 이미지가 없습니다.</p>
              <button
                onClick={handleUpload}
                className="mt-3 px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                이미지 업로드
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {images.map((img) => (
                <div
                  key={img.filename}
                  className="group relative border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-700 hover:shadow-md transition-shadow"
                >
                  {/* Thumbnail */}
                  <ImageThumbnail img={img} onInsert={() => handleInsert(img)} />

                  {/* Info */}
                  <div className="px-2 py-1.5 flex items-center justify-between">
                    <div className="flex-1 min-w-0 mr-2">
                      <div className="text-xs text-gray-600 dark:text-gray-300 truncate" title={img.filename}>
                        {img.filename}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {formatSize(img.size)}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(img.filename)}
                      disabled={deleting === img.filename}
                      className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 rounded transition-colors flex-shrink-0"
                      title="삭제"
                    >
                      {deleting === img.filename ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer info */}
        {images.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400">
            총 {images.length}개 이미지 · 클릭하여 에디터에 삽입
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default ImageManagerModal;
