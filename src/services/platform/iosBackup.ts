import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export async function shareIOSBackup(path: string, json: string): Promise<boolean> {
  const options = { path, directory: Directory.Cache }
  const { uri } = await Filesystem.writeFile({ ...options, data: json, encoding: Encoding.UTF8 })
  try {
    await Share.share({ title: 'Focus Day 数据备份', files: [uri] })
    return true
  } catch (error) {
    if (error instanceof Error && error.message === 'Share canceled') return false
    throw error
  } finally {
    await Filesystem.deleteFile(options).catch(() => undefined)
  }
}
